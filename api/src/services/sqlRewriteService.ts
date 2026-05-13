import nodeSqlParser from "node-sql-parser";
import { singleton } from "tsyringe";

export class SqlRewriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqlRewriteError";
  }
}

export interface SqlRewriteInput {
  readonly sql: string;
  readonly mysqlSchema: string;
  readonly preservedTables: readonly string[];
}

export interface SqlRewriteResult {
  readonly statementType: string;
  readonly rewrittenSql: string;
}

const READ_ONLY_STATEMENTS = new Set(["select", "explain"]);

@singleton()
export class SqlRewriteService {
  private readonly parser = new nodeSqlParser.Parser();

  public rewrite(input: SqlRewriteInput): SqlRewriteResult {
    const ast = this.parse(input.sql);
    const statementType = typeof ast.type === "string" ? ast.type.toLowerCase() : "";

    if (!READ_ONLY_STATEMENTS.has(statementType)) {
      throw new SqlRewriteError(`Only read-only statements are allowed. Received '${statementType}'.`);
    }

    const preservedTables = new Set(input.preservedTables.map(normalizeIdentifier));
    this.qualifyTables(ast, input.mysqlSchema, preservedTables, new Set());

    // DuckDB accepts ANSI double-quoted identifiers; it does not accept MySQL backticks.
    const rewrittenSql = this.parser.sqlify(ast as never, { database: "postgresql" });
    return { statementType, rewrittenSql };
  }

  private parse(sql: string): Record<string, unknown> {
    let parsed: unknown;
    try {
      parsed = this.parser.astify(sql, { database: "MariaDB" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SqlRewriteError(`SQL parse error: ${message}`);
    }

    if (Array.isArray(parsed)) {
      if (parsed.length !== 1) {
        throw new SqlRewriteError("Only a single SQL statement is allowed.");
      }
      parsed = parsed[0];
    }

    if (!parsed || typeof parsed !== "object") {
      throw new SqlRewriteError("Unable to parse SQL statement.");
    }
    return parsed as Record<string, unknown>;
  }

  private qualifyTables(
    node: unknown,
    schema: string,
    preserved: ReadonlySet<string>,
    cteNames: ReadonlySet<string>,
  ): void {
    if (Array.isArray(node)) {
      for (const child of node) this.qualifyTables(child, schema, preserved, cteNames);
      return;
    }
    if (!node || typeof node !== "object") return;

    const obj = node as Record<string, unknown>;

    // Extend visible CTE scope with names declared at this node.
    const localCtes = collectCteNames(obj);
    const scope = localCtes.length > 0 ? new Set([...cteNames, ...localCtes]) : cteNames;

    // Qualify table references in the FROM clause of this node.
    if (Array.isArray(obj.from)) {
      for (const item of obj.from) {
        if (!item || typeof item !== "object") continue;
        const fromItem = item as { table?: unknown; db?: string };
        if (typeof fromItem.table !== "string") continue;

        const table = normalizeIdentifier(fromItem.table);
        if (!preserved.has(table) && !scope.has(table)) {
          fromItem.db = schema;
        }
      }
    }

    for (const value of Object.values(obj)) {
      this.qualifyTables(value, schema, preserved, scope);
    }
  }
}

function normalizeIdentifier(identifier: string): string {
  return identifier.replace(/^[`"\[]|[`"\]]$/g, "").toLowerCase();
}

function collectCteNames(node: Record<string, unknown>): string[] {
  const withClause = node.with;
  if (!Array.isArray(withClause)) return [];

  const names: string[] = [];
  for (const item of withClause) {
    const value = (item as { name?: { value?: unknown } } | null)?.name?.value;
    if (typeof value === "string" && value.length > 0) {
      names.push(normalizeIdentifier(value));
    }
  }
  return names;
}





