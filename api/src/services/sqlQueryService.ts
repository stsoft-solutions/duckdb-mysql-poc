import { inject, singleton } from "tsyringe";
import {
  type AppLogger,
  type DatabaseConnection,
  DbPoolManager,
  getOptionsMonitorToken,
  LoggerFactory,
  type OptionsMonitor,
} from "@duckdb-poc/shared-infra";
import path from "node:path";
import { type SqlQueryOptions, SqlQueryOptionsProvider } from "../config/sqlQueryOptions.js";
import { SqlRewriteError, SqlRewriteService } from "./sqlRewriteService.js";

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

export class SqlQueryTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`SQL query exceeded timeout (${timeoutMs} ms).`);
    this.name = "SqlQueryTimeoutError";
  }
}

export interface SqlQueryExecutionResult {
  readonly statementType: string;
  readonly rewrittenSql: string;
  readonly rows: Record<string, unknown>[];
  readonly rowCount: number;
  readonly elapsedMs: number;
}

@singleton()
export class SqlQueryService {
  private readonly logger: AppLogger;
  private initializationPromise: Promise<void> | null = null;

  constructor(
    @inject(DbPoolManager)
    private readonly dbPoolManager: DbPoolManager,
    @inject(LoggerFactory)
    loggerFactory: LoggerFactory,
    @inject(getOptionsMonitorToken(SqlQueryOptionsProvider))
    private readonly sqlOptionsMonitor: OptionsMonitor<SqlQueryOptions>,
    @inject(SqlRewriteService)
    private readonly sqlRewriteService: SqlRewriteService,
  ) {
    this.logger = loggerFactory.create(SqlQueryService);

    this.sqlOptionsMonitor.onChange(() => {
      this.initializationPromise = null;
      this.logger.info("SQL query configuration changed; federated views will be rebuilt on next query");
    });
  }

  public async initializeIfConfigured(): Promise<void> {
    if (!this.sqlOptionsMonitor.currentValue.initializeOnStartup) {
      return;
    }

    await this.ensureInitialized();
  }

  public async execute(sql: string): Promise<SqlQueryExecutionResult> {
    const options = this.sqlOptionsMonitor.currentValue;
    const rewriteResult = this.sqlRewriteService.rewrite({
      sql,
      mysqlSchema: options.mysqlSchema,
      preservedTables: options.tables.map((table) => table.table),
    });

    try {
      await this.ensureInitialized();
    } catch (initError) {
      // Initialization may fail when MySQL is temporarily unavailable.
      // Proceed to execute anyway so DuckDB can still surface parser/binder
      // errors for invalid SQL (returning 400) rather than masking them with
      // an infrastructure 500.
      this.logger.warn("Federated view initialization failed; proceeding with query execution", {
        error: initError instanceof Error ? initError.message : String(initError),
      });
    }

    const startedAt = Date.now();

    const queryPromise = this.dbPoolManager
      .getDatabase(options.dbConnection)
      .query<Record<string, unknown>>(rewriteResult.rewrittenSql);

    const rows = await this.withTimeout(queryPromise, options.timeoutMs);
    const safeRows = rows.map((row) => this.toJsonSafeValue(row) as Record<string, unknown>);

    return {
      statementType: rewriteResult.statementType,
      rewrittenSql: rewriteResult.rewrittenSql,
      rows: safeRows,
      rowCount: safeRows.length,
      elapsedMs: Date.now() - startedAt,
    };
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeViews().catch((error) => {
        // Reset so the next request retries initialization (e.g. when MySQL recovers).
        this.initializationPromise = null;
        throw error;
      });
    }

    await this.initializationPromise;
  }

  private async initializeViews(): Promise<void> {
    const options = this.sqlOptionsMonitor.currentValue;
    const db = this.dbPoolManager.getDatabase(options.dbConnection);
    const conn = await db.getConnection();

    try {
      for (const tableInfo of options.tables) {

        const parquetGlob = this.resolveParquetGlob(options.parquetRoot, tableInfo.table, tableInfo.parquetGlob);

        // Get maximum timestamp from parquet files to determine hot/cold split
        const maxTimestamp = await this.getMaxTimestampFromParquet(parquetGlob, tableInfo.field, tableInfo.fieldType, conn);


        const createViewSql = `
          CREATE OR REPLACE VIEW ${this.quoteIdentifier(tableInfo.table)} AS
          SELECT *, 'p' as ds FROM read_parquet('${this.escapeSqlString(parquetGlob)}', hive_partitioning = false)
          WHERE ${tableInfo.field} <= ${maxTimestamp}        
          UNION ALL BY NAME
          SELECT *, 'd' as ds FROM ${this.quoteIdentifier(options.mysqlSchema)}.${this.quoteIdentifier(tableInfo.table_override || tableInfo.table)}
          WHERE ${tableInfo.field} > ${maxTimestamp}
        `;

        await conn.execute(createViewSql);

        this.logger.info("Initialized federated DuckDB view", {
          table: tableInfo.table,
          mysqlSchema: options.mysqlSchema,
          parquetGlob,
        });
      }
    } finally {
      await conn.release();
    }
  }

  private async withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        work,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new SqlQueryTimeoutError(timeoutMs));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private resolveParquetGlob(parquetRoot: string, tableName: string, explicitGlob: string | undefined): string {
    const pattern = explicitGlob ?? path.join(parquetRoot, tableName, "**", "*.parquet");
    const absolute = path.resolve(process.cwd(), pattern);
    return absolute.replace(/\\/g, "/");
  }

  private quoteIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
  }

  private toJsonSafeValue(value: unknown): unknown {
    if (typeof value === "bigint") {
      if (value <= MAX_SAFE_BIGINT && value >= MIN_SAFE_BIGINT) {
        return Number(value);
      }
      return value.toString();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.toJsonSafeValue(item));
    }

    if (value && typeof value === "object") {
      if (value instanceof Date) {
        return value.toISOString();
      }

      const safeObject: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(value)) {
        safeObject[key] = this.toJsonSafeValue(nestedValue);
      }
      return safeObject;
    }

    return value;
  }

  private async getMaxTimestampFromParquet(
    parquetGlob: string,
    field: string,
    fieldType: string,
    conn: DatabaseConnection
  ): Promise<string> {
    const rows = await conn.query<{ max_timestamp: string | null }>(`
      SELECT MAX(${this.quoteIdentifier(field)})::VARCHAR AS max_timestamp
      FROM read_parquet('${this.escapeSqlString(parquetGlob)}', hive_partitioning = false)
    `);

    const maxTimestamp = rows[0]?.max_timestamp ?? null;
    if (maxTimestamp === null) {
      return this.getMinimumTimestampLiteral(fieldType);
    }

    switch (fieldType) {
      case "epoch":
      case "epoch_ms":
        if (!/^-?\d+$/.test(maxTimestamp)) {
          throw new Error(`Expected integer parquet max timestamp for field type '${fieldType}', got '${maxTimestamp}'.`);
        }
        return maxTimestamp;
      case "datetime":
        return `TIMESTAMP '${this.escapeSqlString(maxTimestamp)}'`;
      default:
        throw new Error(`Unsupported federated timestamp field type '${fieldType}'.`);
    }
  }

  private getMinimumTimestampLiteral(fieldType: string): string {
    switch (fieldType) {
      case "epoch_seconds":
      case "epoch_milliseconds":
        return "-9223372036854775808";
      case "datetime":
        return "TIMESTAMP '1000-01-01 00:00:00'";
      default:
        throw new Error(`Unsupported federated timestamp field type '${fieldType}'.`);
    }
  }
}

export { SqlRewriteError };
