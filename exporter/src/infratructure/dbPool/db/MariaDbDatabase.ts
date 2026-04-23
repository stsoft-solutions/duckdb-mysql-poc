import { createPool, Pool, PoolConnection as NativePoolConnection } from 'mariadb';
import { IConnection } from '../IConnection.js';
import { IDatabase } from '../IDatabase.js';
import { IMariaDbPoolOptions } from '../IDbPoolOptions.js';

class MariaDbConnection implements IConnection {
  constructor(private readonly conn: NativePoolConnection) {}

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.conn.query(sql, params) as Promise<T[]>;
  }

  async queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]> {
    return this.conn.query({ sql, rowsAsArray: true }, params) as Promise<unknown[][]>;
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    await this.conn.query(sql, params);
  }

  async beginTransaction(): Promise<void> {
    await this.conn.beginTransaction();
  }

  async commit(): Promise<void> {
    await this.conn.commit();
  }

  async rollback(): Promise<void> {
    await this.conn.rollback();
  }

  async release(): Promise<void> {
    this.conn.release();
  }
}

export class MariaDbDatabase implements IDatabase {
  private pool: Pool | null = null;

  constructor(private readonly options: IMariaDbPoolOptions) {}

  private getPool(): Pool {
    if (!this.pool) {
      this.pool = createPool({
        host: this.options.host,
        port: this.options.port,
        user: this.options.username,
        password: this.options.password,
        database: this.options.database,
        connectionLimit: this.options.poolSize ?? 10,
      });
    }
    return this.pool!;
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.getPool().query(sql, params) as Promise<T[]>;
  }

  async queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]> {
    return this.getPool().query({ sql, rowsAsArray: true }, params) as Promise<unknown[][]>;
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    await this.getPool().query(sql, params);
  }

  async getConnection(): Promise<IConnection> {
    const conn = await this.getPool().getConnection();
    return new MariaDbConnection(conn);
  }

  async releaseConnection(connection: IConnection): Promise<void> {
    await connection.release();
  }

  querySync<T = Record<string, unknown>>(_sql: string, _params?: unknown[]): T[] {
    throw new Error('Synchronous operations are not supported for MariaDB.');
  }

  queryRawSync(_sql: string, _params?: unknown[]): unknown[][] {
    throw new Error('Synchronous operations are not supported for MariaDB.');
  }

  executeSync(_sql: string, _params?: unknown[]): void {
    throw new Error('Synchronous operations are not supported for MariaDB.');
  }

  getConnectionSync(): IConnection {
    throw new Error('Synchronous operations are not supported for MariaDB.');
  }

  releaseConnectionSync(_connection: IConnection): void {
    throw new Error('Synchronous operations are not supported for MariaDB.');
  }
}
