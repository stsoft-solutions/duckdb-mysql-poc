import nodeSqlParser from "node-sql-parser";
import { singleton } from "tsyringe";

const { Parser } = nodeSqlParser as {
  Parser: new () => { astify(sql: string, options?: unknown): unknown; sqlify(ast: unknown, options?: unknown): string }
};

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

type SqlAstNode = Record<string, unknown>;

interface RewriteContext {
  readonly mysqlSchema: string;
  readonly preservedTables: ReadonlySet<string>;
  readonly cteNames: ReadonlySet<string>;
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
    this.rewriteNode(parsed, {
      mysqlSchema: input.mysqlSchema,
      preservedTables,
      cteNames: new Set<string>(),
    });

    // DuckDB accepts ANSI double-quoted identifiers; it does not accept MySQL backticks.
    const rewrittenSql = this.parser.sqlify(parsed as never, { database: "postgresql" });
    return {
      statementType,
      rewrittenSql,
    };
  }

  private parseSingleStatement(sql: string): SqlAstNode {
    let parsed: unknown;

    try {
      parsed = this.parser.astify(sql, { database: "MariaDB" });
    } catch (error) {
      throw new SqlRewriteError(`SQL parse error: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (Array.isArray(parsed)) {
      if (parsed.length !== 1) {
        throw new SqlRewriteError("Only a single SQL statement is allowed.");
      }
      return parsed[0] as SqlAstNode;
    }

    if (!parsed || typeof parsed !== "object") {
      throw new SqlRewriteError("Unable to parse SQL statement.");
    }

    return parsed as SqlAstNode;
  }

  private getStatementType(ast: SqlAstNode): string {
    const statementType = ast.type;
    if (typeof statementType !== "string" || statementType.length === 0) {
      throw new SqlRewriteError("Unable to determine SQL statement type.");
    }

    return statementType.toLowerCase();
  }

  private collectCteNames(ast: SqlAstNode): string[] {
    const cteNames: string[] = [];

    const withClause = ast.with;
    if (!Array.isArray(withClause)) {
      return cteNames;
    }

    for (const item of withClause) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const nameNode = (item as SqlAstNode).name;
      if (!this.isRecord(nameNode)) {
        continue;
      }

      const value = nameNode.value;
      if (typeof value !== "string" || value.length === 0) {
        continue;
      }

      cteNames.push(this.normalizeIdentifier(value));
    }

    return cteNames;
  }

  private rewriteNode(node: unknown, context: RewriteContext): void {
    if (!node) {
      return;
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        this.rewriteNode(child, context);
      }
      return;
    }

    if (!this.isRecord(node)) {
      return;
    }

    const objectNode = node;
    const scopedContext = this.addLocalCteNames(objectNode, context);

    this.rewriteFromClause(objectNode.from, scopedContext);

    for (const value of Object.values(objectNode)) {
      this.rewriteNode(value, scopedContext);
    }
  }

  private addLocalCteNames(node: SqlAstNode, context: RewriteContext): RewriteContext {
    const localCteNames = this.collectCteNames(node);
    if (localCteNames.length === 0) {
      return context;
    }

    return {
      ...context,
      cteNames: new Set([...context.cteNames, ...localCteNames]),
    };
  }

  private rewriteFromClause(fromClause: unknown, context: RewriteContext): void {
    if (!Array.isArray(fromClause)) {
      return;
    }

    for (const fromItem of fromClause) {
      if (!this.isRecord(fromItem) || !this.isFromTableItem(fromItem)) {
        continue;
      }

      const normalizedTable = this.normalizeIdentifier(fromItem.table);
      if (context.preservedTables.has(normalizedTable) || context.cteNames.has(normalizedTable)) {
        continue;
      }

      fromItem.db = context.mysqlSchema;
    }
  }

  private isFromTableItem(node: SqlAstNode): node is SqlAstNode & { table: string; db?: string | null } {
    return typeof node.table === "string";
  }

  private isRecord(value: unknown): value is SqlAstNode {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  private normalizeIdentifier(identifier: string): string {
    return identifier.replace(/^[`"\[]|[`"\]]$/g, "").toLowerCase();
  }
}





