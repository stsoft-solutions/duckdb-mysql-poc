import { performance } from "node:perf_hooks";
import type { DatabaseConnection } from "../databaseConnection.js";
import type { AppLogger } from "../../logger/appLogger.js";

export abstract class DatabaseConnectionBase implements DatabaseConnection {
  protected constructor(protected readonly logger: AppLogger) {
  }

  public static logSql(logger: AppLogger, sql: string, params?: unknown[]): void {
    const sqlStatement = DatabaseConnectionBase.toSingleLineSql(sql);
    logger.debug("Executing SQL statement", {
      sql: sqlStatement,
      params: DatabaseConnectionBase.summarizeParams(params)
    });
  }

  public static toSingleLineSql(sql: string): string {
    return sql.replace(/\s+/g, " ").trim();
  }

  protected static summarizeParams(params?: unknown[]): unknown[] | undefined {
    if (!params) {
      return undefined;
    }

    return params.map(value => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === "bigint") {
        return value.toString();
      }
      if (value === null || value === undefined) {
        return value;
      }
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return value;
      }
      return Object.prototype.toString.call(value);
    });
  }

  protected static elapsedMs(startedAt: number): number {
    return Math.round(performance.now() - startedAt);
  }

  abstract query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;

  abstract queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]>;

  abstract execute(sql: string, params?: unknown[]): Promise<void>;

  abstract beginTransaction(): Promise<void>;

  abstract commit(): Promise<void>;

  abstract rollback(): Promise<void>;

  abstract release(): Promise<void>;

  protected logSql(sql: string, params?: unknown[]): void {
    DatabaseConnectionBase.logSql(this.logger, sql, params);
  }
}

