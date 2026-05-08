import { DuckDBConnection as NativeDuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import type { DatabaseConnection } from '../databaseConnection';
import type { Database } from '../database';
import type { DuckDbMySqlAttachmentOptions, DuckDbPoolOptions, DuckDbSettingValue } from '../dbPoolOptions';
import type { AppLogger } from '../../logger/appLogger';
import { DatabaseConnectionBase } from "./databaseConnectionBase";


class DuckDbConnection extends DatabaseConnectionBase {
  constructor(
    private readonly conn: NativeDuckDBConnection,
    logger: AppLogger
  ) {
    super(logger);
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    this.logSql(sql);
    const reader = await this.conn.runAndReadAll(sql, params as never);
    return reader.getRowObjectsJS() as unknown as T[];
  }

  async queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]> {
    this.logSql(sql);
    const reader = await this.conn.runAndReadAll(sql, params as never);
    return reader.getRowsJS() as unknown[][];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    await this.runSql(sql, params);
  }

  async beginTransaction(): Promise<void> {
    await this.runSql('BEGIN TRANSACTION');
  }

  async commit(): Promise<void> {
    await this.runSql('COMMIT');
  }

  async rollback(): Promise<void> {
    await this.runSql('ROLLBACK');
  }

  async release(): Promise<void> {
    this.conn.closeSync();
  }

  private async runSql(sql: string, params?: unknown[]): Promise<void> {
    this.logSql(sql);
    await this.conn.run(sql, params as never);
  }
}

export class DuckDbDatabase implements Database {
  private instancePromise: Promise<DuckDBInstance> | null = null;

  constructor(
    private readonly options: DuckDbPoolOptions,
    private readonly logger: AppLogger
  ) {
  }

  private static getDatabasePath(options: DuckDbPoolOptions): string {
    if (options.storage.mode === 'memory') {
      return ':memory:';
    }
    return options.storage.path;
  }

  private static escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
  }

  private static formatSettingValue(value: DuckDbSettingValue): string {
    if (typeof value === 'string') {
      return `'${DuckDbDatabase.escapeSqlString(value)}'`;
    }
    return String(value);
  }

  private static buildMySqlAttachSql(attachment: DuckDbMySqlAttachmentOptions): string {
    const readOnly = attachment.readOnly ?? true;
    const connectionString = [
      `host=${attachment.host}`,
      `port=${attachment.port}`,
      `database=${attachment.database}`,
      `user=${attachment.username}`,
      `password=${attachment.password}`,
    ].join(' ');

    return [
      `ATTACH IF NOT EXISTS '${DuckDbDatabase.escapeSqlString(connectionString)}'`,
      `AS ${attachment.alias} (TYPE mysql${readOnly ? ', READ_ONLY' : ''})`,
    ].join(' ');
  }

  private static buildMaskedMySqlAttachSql(attachment: DuckDbMySqlAttachmentOptions): string {
    return DuckDbDatabase.buildMySqlAttachSql({
      ...attachment,
      password: '***',
    });
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const conn = await this.getConnection();
    try {
      return await conn.query<T>(sql, params);
    } finally {
      await conn.release();
    }
  }

  async queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]> {
    const conn = await this.getConnection();
    try {
      return await conn.queryRaw(sql, params);
    } finally {
      await conn.release();
    }
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    const conn = await this.getConnection();
    try {
      await conn.execute(sql, params);
    } finally {
      await conn.release();
    }
  }

  async getConnection(): Promise<DatabaseConnection> {
    const instance = await this.getInstance();
    const conn = await instance.connect();
    return new DuckDbConnection(conn, this.logger);
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    await connection.release();
  }

  private async getInstance(): Promise<DuckDBInstance> {
    if (!this.instancePromise) {
      this.instancePromise = this.createInitializedInstance();
    }
    return this.instancePromise;
  }

  private async createInitializedInstance(): Promise<DuckDBInstance> {
    const opts: Record<string, string> = {};
    if (this.options.accessMode) {
      opts['access_mode'] = this.options.accessMode;
    }

    const instance = await DuckDBInstance.create(DuckDbDatabase.getDatabasePath(this.options), opts);
    try {
      await this.initializeInstance(instance);
      return instance;
    } catch (error) {
      instance.closeSync();
      this.instancePromise = null;
      throw error;
    }
  }

  private async initializeInstance(instance: DuckDBInstance): Promise<void> {
    const conn = await instance.connect();
    try {
      await this.applyInitializationSettings(conn);
      for (const extension of this.options.extensions ?? []) {
        await this.runSql(conn, `INSTALL ${extension}`);
        await this.runSql(conn, `LOAD ${extension}`);
      }
      await this.attachDatabases(conn);
    } finally {
      conn.closeSync();
    }
  }

  private async applyInitializationSettings(conn: NativeDuckDBConnection): Promise<void> {
    const initialization = this.options.initialization;
    if (initialization?.settings !== undefined) {
      this.logger.debug('Applying DuckDB initialization settings');
      for (const [name, value] of Object.entries(initialization.settings)) {
        await this.runSql(conn, `SET ${name} = ${DuckDbDatabase.formatSettingValue(value)}`);
      }
    }
  }

  private async attachDatabases(conn: NativeDuckDBConnection): Promise<void> {
    for (const attachment of this.options.attachments ?? []) {
      await this.runSql(
        conn,
        DuckDbDatabase.buildMySqlAttachSql(attachment),
        DuckDbDatabase.buildMaskedMySqlAttachSql(attachment)
      );
    }
  }

  private async runSql(
    conn: NativeDuckDBConnection,
    sql: string,
    loggedSql: string = sql
  ): Promise<void> {
    DatabaseConnectionBase.logSql(this.logger, loggedSql);
    await conn.run(sql);
  }

}
