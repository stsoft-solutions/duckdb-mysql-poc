import { DuckDBConnection as NativeDuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import type { IConnection } from '../IConnection';
import type { IDatabase } from '../IDatabase';
import type { DuckDbSettingValue, IDuckDbMySqlAttachmentOptions, IDuckDbPoolOptions } from '../IDbPoolOptions';
import type { AppLogger } from '../../logger/appLogger';
import { DatabaseConnectionBase } from './DatabaseConnectionBase';

class DuckDbConnection extends DatabaseConnectionBase {
  constructor(
    private readonly conn: NativeDuckDBConnection,
    logger: AppLogger
  ) {
    super(logger);
  }

  private async runSql(sql: string, params?: unknown[]): Promise<void> {
    this.logSql(sql);
    await this.conn.run(sql, params as never);
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
}

export class DuckDbDatabase implements IDatabase {
  private instance: DuckDBInstance | null = null;
  private instancePromise: Promise<DuckDBInstance> | null = null;

  constructor(
    private readonly options: IDuckDbPoolOptions,
    private readonly logger: AppLogger
  ) {}

  private static getDatabasePath(options: IDuckDbPoolOptions): string {
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

  private static buildMySqlAttachSql(attachment: IDuckDbMySqlAttachmentOptions): string {
    const readOnly = attachment.readOnly ?? true;
    const connectionString = [
      `host=${attachment.host}`,
      `port=${attachment.port}`,
      `database=${attachment.database}`,
      `user=${attachment.username}`,
      `password=${attachment.password}`,
    ].join(' ');

    return [
      `ATTACH '${DuckDbDatabase.escapeSqlString(connectionString)}'`,
      `AS ${attachment.alias} (TYPE mysql${readOnly ? ', READ_ONLY' : ''})`,
    ].join(' ');
  }

  private static buildMaskedMySqlAttachSql(attachment: IDuckDbMySqlAttachmentOptions): string {
    return DuckDbDatabase.buildMySqlAttachSql({
      ...attachment,
      password: '***',
    });
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
      this.instance = instance;
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

  private async initializeConnection(conn: NativeDuckDBConnection): Promise<void> {
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

  async getConnection(): Promise<IConnection> {
    const instance = await this.getInstance();
    const conn = await instance.connect();
    try {
      await this.initializeConnection(conn);
    } catch (error) {
      conn.closeSync();
      throw error;
    }
    return new DuckDbConnection(conn, this.logger);
  }

  async releaseConnection(connection: IConnection): Promise<void> {
    await connection.release();
  }

}
