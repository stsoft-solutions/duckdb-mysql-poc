import { DuckDBConnection as NativeDuckDBConnection, DuckDBInstance, DuckDBTimestampValue } from '@duckdb/node-api';
import type { DuckDBValue } from '@duckdb/node-api';
import { performance } from 'node:perf_hooks';
import type { DatabaseConnection } from '../databaseConnection.js';
import type { Database } from '../database.js';
import type { DuckDbMySqlAttachmentOptions, DuckDbPoolOptions, DuckDbSettingValue } from '../dbPoolOptions.js';
import type { AppLogger } from '../../logger/appLogger.js';
import { DatabaseConnectionBase } from "./databaseConnectionBase.js";


class DuckDbConnection extends DatabaseConnectionBase {
  constructor(
    private readonly conn: NativeDuckDBConnection,
    logger: AppLogger
  ) {
    super(logger);
  }

  /**
   * Converts an array of unknown JS values to DuckDBValue[],
   * mapping Date → DuckDBTimestampValue (microseconds since epoch).
   */
  private static convertParams(params: unknown[]): DuckDBValue[] {
    return params.map(p => {
      if (p instanceof Date) {
        // DuckDBTimestampValue have expected microseconds since Unix epoch
        return new DuckDBTimestampValue(BigInt(p.getTime()) * 1000n);
      }
      return p as DuckDBValue;
    });
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    this.logSql(sql, params);
    const startedAt = performance.now();
    const converted = params ? DuckDbConnection.convertParams(params) : undefined;
    const reader = await this.conn.runAndReadAll(sql, converted);
    const rows = reader.getRowObjectsJS() as unknown as T[];
    this.logger.debug('DuckDB query completed', {
      elapsedMs: DatabaseConnectionBase.elapsedMs(startedAt),
      rows: rows.length
    });
    return rows;
  }

  async queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]> {
    this.logSql(sql, params);
    const startedAt = performance.now();
    const converted = params ? DuckDbConnection.convertParams(params) : undefined;
    const reader = await this.conn.runAndReadAll(sql, converted);
    const rows = reader.getRowsJS() as unknown[][];
    this.logger.debug('DuckDB raw query completed', {
      elapsedMs: DatabaseConnectionBase.elapsedMs(startedAt),
      rows: rows.length
    });
    return rows;
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
    this.logSql(sql, params);
    const startedAt = performance.now();
    const converted = params ? DuckDbConnection.convertParams(params) : undefined;
    await this.conn.run(sql, converted);
    this.logger.debug('DuckDB statement completed', {
      elapsedMs: DatabaseConnectionBase.elapsedMs(startedAt)
    });
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
    const startedAt = performance.now();
    const instance = await this.getInstance();
    const conn = await instance.connect();
    this.logger.debug('DuckDB connection acquired', {
      elapsedMs: Math.round(performance.now() - startedAt)
    });
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
    const startedAt = performance.now();
    const opts: Record<string, string> = {};
    if (this.options.accessMode) {
      opts['access_mode'] = this.options.accessMode;
    }

    const instance = await DuckDBInstance.create(DuckDbDatabase.getDatabasePath(this.options), opts);
    try {
      await this.initializeInstance(instance);
      this.logger.info('DuckDB instance initialized', {
        storageMode: this.options.storage.mode,
        elapsedMs: Math.round(performance.now() - startedAt)
      });
      return instance;
    } catch (error) {
      instance.closeSync();
      this.instancePromise = null;
      throw error;
    }
  }

  private async initializeInstance(instance: DuckDBInstance): Promise<void> {
    const startedAt = performance.now();
    const conn = await instance.connect();
    try {
      await this.applyInitializationSettings(conn);
      for (const extension of this.options.extensions ?? []) {
        const extensionStartedAt = performance.now();
        await this.runSql(conn, `INSTALL ${extension}`);
        await this.runSql(conn, `LOAD ${extension}`);
        this.logger.debug('DuckDB extension loaded', {
          extension,
          elapsedMs: Math.round(performance.now() - extensionStartedAt)
        });
      }
      await this.attachDatabases(conn);
      this.logger.debug('DuckDB connection initialization completed', {
        elapsedMs: Math.round(performance.now() - startedAt)
      });
    } finally {
      conn.closeSync();
    }
  }

  private async applyInitializationSettings(conn: NativeDuckDBConnection): Promise<void> {
    const initialization = this.options.initialization;
    if (initialization?.settings !== undefined) {
      this.logger.debug('Applying DuckDB initialization settings');
      for (const [name, value] of Object.entries(initialization.settings)) {
        const settingStartedAt = performance.now();
        await this.runSql(conn, `SET ${name} = ${DuckDbDatabase.formatSettingValue(value)}`);
        this.logger.debug('Applied DuckDB setting', {
          name,
          value,
          elapsedMs: Math.round(performance.now() - settingStartedAt)
        });
      }
    }
  }

  private async attachDatabases(conn: NativeDuckDBConnection): Promise<void> {
    for (const attachment of this.options.attachments ?? []) {
      const attachStartedAt = performance.now();
      await this.runSql(
        conn,
        DuckDbDatabase.buildMySqlAttachSql(attachment),
        DuckDbDatabase.buildMaskedMySqlAttachSql(attachment)
      );
      this.logger.info('Attached external database', {
        alias: attachment.alias,
        type: attachment.type,
        host: attachment.host,
        database: attachment.database,
        readOnly: attachment.readOnly ?? true,
        elapsedMs: Math.round(performance.now() - attachStartedAt)
      });
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
