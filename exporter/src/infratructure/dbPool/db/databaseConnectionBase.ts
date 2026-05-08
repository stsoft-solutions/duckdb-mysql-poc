import type { DatabaseConnection } from '../databaseConnection';
import type { AppLogger } from '../../logger/appLogger';

export abstract class DatabaseConnectionBase implements DatabaseConnection {
  protected constructor(protected readonly logger: AppLogger) {
  }

  public static logSql(logger: AppLogger, sql: string): void {
    const sqlStatement = DatabaseConnectionBase.toSingleLineSql(sql);
    logger.debug({ sql: sqlStatement }, `Executing SQL statement: ${sqlStatement}`);
  }

  public static toSingleLineSql(sql: string): string {
    return sql.replace(/\s+/g, ' ').trim();
  }

  abstract query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;

  abstract queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]>;

  abstract execute(sql: string, params?: unknown[]): Promise<void>;

  abstract beginTransaction(): Promise<void>;

  abstract commit(): Promise<void>;

  abstract rollback(): Promise<void>;

  abstract release(): Promise<void>;

  protected logSql(sql: string): void {
    DatabaseConnectionBase.logSql(this.logger, sql);
  }
}
