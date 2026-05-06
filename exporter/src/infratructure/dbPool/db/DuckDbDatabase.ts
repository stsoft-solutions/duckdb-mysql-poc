import { DuckDBConnection as NativeDuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import type { IConnection } from '../IConnection';
import type { IDatabase } from '../IDatabase';
import type { DuckDbSettingValue, IDuckDbMySqlAttachmentOptions, IDuckDbPoolOptions } from '../IDbPoolOptions';

class DuckDbConnection implements IConnection {
  constructor(private readonly conn: NativeDuckDBConnection) {}

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const reader = await this.conn.runAndReadAll(sql, params as never);
    return reader.getRowObjectsJS() as unknown as T[];
  }

  async queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]> {
    const reader = await this.conn.runAndReadAll(sql, params as never);
    return reader.getRowsJS() as unknown[][];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    await this.conn.run(sql, params as never);
  }

  async beginTransaction(): Promise<void> {
    await this.conn.run('BEGIN TRANSACTION');
  }

  async commit(): Promise<void> {
    await this.conn.run('COMMIT');
  }

  async rollback(): Promise<void> {
    await this.conn.run('ROLLBACK');
  }

  async release(): Promise<void> {
    this.conn.closeSync();
  }
}

export class DuckDbDatabase implements IDatabase {
  private instance: DuckDBInstance | null = null;

  constructor(private readonly options: IDuckDbPoolOptions) {}

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

  private async getInstance(): Promise<DuckDBInstance> {
    if (!this.instance) {
      const opts: Record<string, string> = {};
      if (this.options.accessMode) {
        opts['access_mode'] = this.options.accessMode;
      }
      this.instance = await DuckDBInstance.create(DuckDbDatabase.getDatabasePath(this.options), opts);
    }
    return this.instance;
  }

  private async initializeConnection(conn: NativeDuckDBConnection): Promise<void> {
    const initialization = this.options.initialization;

    if (initialization?.settings !== undefined) {
      console.log('Applying DuckDB initialization settings...');
      for (const [name, value] of Object.entries(initialization.settings)) {
        await conn.run(`SET ${name} = ${DuckDbDatabase.formatSettingValue(value)}`);
      }
    }

    for (const extension of this.options.extensions ?? []) {
      await conn.run(`INSTALL ${extension}`);
      await conn.run(`LOAD ${extension}`);
    }

    for (const attachment of this.options.attachments ?? []) {
      await conn.run(DuckDbDatabase.buildMySqlAttachSql(attachment));
    }
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
    return new DuckDbConnection(conn);
  }

  async releaseConnection(connection: IConnection): Promise<void> {
    await connection.release();
  }

}
