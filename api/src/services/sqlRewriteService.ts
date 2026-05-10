import nodeSqlParser from "node-sql-parser";
import { singleton } from "tsyringe";

const { Parser } = nodeSqlParser as { Parser: new () => { astify(sql: string, options?: unknown): unknown; sqlify(ast: unknown, options?: unknown): string } };

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
  private readonly parser = new Parser();

  public rewrite(input: SqlRewriteInput): SqlRewriteResult {
    const parsed = this.parseSingleStatement(input.sql);
    const statementType = this.getStatementType(parsed);

    if (!READ_ONLY_STATEMENTS.has(statementType)) {
      throw new SqlRewriteError(`Only read-only statements are allowed. Received '${statementType}'.`);
    }

    const preservedTables = new Set(input.preservedTables.map((table) => this.normalizeIdentifier(table)));
    const cteNames = new Set(this.collectCteNames(parsed));

    this.rewriteNode(parsed, {
      mysqlSchema: input.mysqlSchema,
      preservedTables,
      cteNames,
    });

    // DuckDB accepts ANSI double-quoted identifiers; it does not accept MySQL backticks.
    const rewrittenSql = this.parser.sqlify(parsed as never, { database: "postgresql" });
    return {
      statementType,
      rewrittenSql,
    };
  }

  private parseSingleStatement(sql: string): Record<string, unknown> {
    let parsed: unknown;

    try {
      parsed = this.parser.astify(sql, { database: "MySQL" });
    } catch (error) {
      throw new SqlRewriteError(`SQL parse error: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (Array.isArray(parsed)) {
      if (parsed.length !== 1) {
        throw new SqlRewriteError("Only a single SQL statement is allowed.");
      }
      return parsed[0] as Record<string, unknown>;
    }

    if (!parsed || typeof parsed !== "object") {
      throw new SqlRewriteError("Unable to parse SQL statement.");
    }

    return parsed as Record<string, unknown>;
  }

  private getStatementType(ast: Record<string, unknown>): string {
    const statementType = ast.type;
    if (typeof statementType !== "string" || statementType.length === 0) {
      throw new SqlRewriteError("Unable to determine SQL statement type.");
    }

    return statementType.toLowerCase();
  }

  private collectCteNames(ast: Record<string, unknown>): string[] {
    const cteNames: string[] = [];

    const withClause = ast.with;
    if (!Array.isArray(withClause)) {
      return cteNames;
    }

    for (const item of withClause) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const nameNode = (item as Record<string, unknown>).name;
      if (!nameNode || typeof nameNode !== "object") {
        continue;
      }

      const value = (nameNode as Record<string, unknown>).value;
      if (typeof value !== "string" || value.length === 0) {
        continue;
      }

      cteNames.push(this.normalizeIdentifier(value));
    }

    return cteNames;
  }

  private rewriteNode(
    node: unknown,
    context: {
      mysqlSchema: string;
      preservedTables: ReadonlySet<string>;
      cteNames: ReadonlySet<string>;
    },
  ): void {
    if (!node) {
      return;
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        this.rewriteNode(child, context);
      }
      return;
    }

    if (typeof node !== "object") {
      return;
    }

    const objectNode = node as Record<string, unknown>;

    if (this.isTableReferenceNode(objectNode)) {
      const db = objectNode.db;
      const table = objectNode.table;
      if (typeof table !== "string") {
        return;
      }
      const normalizedTable = this.normalizeIdentifier(table);

      if (
        typeof db !== "string" &&
        !context.preservedTables.has(normalizedTable) &&
        !context.cteNames.has(normalizedTable)
      ) {
        objectNode.db = context.mysqlSchema;
      }
    }

    const traversableNode = objectNode as Record<string, unknown>;
    for (const key of Object.keys(traversableNode)) {
      this.rewriteNode(traversableNode[key], context);
    }
  }

  private isTableReferenceNode(node: Record<string, unknown>): node is Record<"table" | "db", string | null | undefined> {
    if (!("table" in node) || typeof node.table !== "string") {
      return false;
    }

    // Column references also have a "table" field. Exclude them explicitly.
    if ("column" in node) {
      return false;
    }

    return true;
  }

  private normalizeIdentifier(identifier: string): string {
    return identifier.replace(/^[`"\[]|[`"\]]$/g, "").toLowerCase();
  }
}





