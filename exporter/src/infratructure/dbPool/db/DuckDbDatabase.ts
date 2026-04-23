import { DuckDBConnection as NativeDuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { IConnection } from '../IConnection.js';
import { IDatabase } from '../IDatabase.js';
import { IDuckDbPoolOptions } from '../IDbPoolOptions.js';

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
    await this.conn.run('BEGIN');
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

  private async getInstance(): Promise<DuckDBInstance> {
    if (!this.instance) {
      const opts: Record<string, string> = {};
      if (this.options.accessMode) {
        opts['access_mode'] = this.options.accessMode;
      }
      this.instance = await DuckDBInstance.create(this.options.path, opts);
    }
    return this.instance;
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
    return new DuckDbConnection(conn);
  }

  async releaseConnection(connection: IConnection): Promise<void> {
    await connection.release();
  }

  querySync<T = Record<string, unknown>>(_sql: string, _params?: unknown[]): T[] {
    throw new Error('Synchronous operations are not supported for DuckDB.');
  }

  queryRawSync(_sql: string, _params?: unknown[]): unknown[][] {
    throw new Error('Synchronous operations are not supported for DuckDB.');
  }

  executeSync(_sql: string, _params?: unknown[]): void {
    throw new Error('Synchronous operations are not supported for DuckDB.');
  }

  getConnectionSync(): IConnection {
    throw new Error('Synchronous operations are not supported for DuckDB.');
  }

  releaseConnectionSync(_connection: IConnection): void {
    throw new Error('Synchronous operations are not supported for DuckDB.');
  }
}
