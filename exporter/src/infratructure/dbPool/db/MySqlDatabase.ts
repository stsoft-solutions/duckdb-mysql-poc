import mysql, { Pool, PoolConnection as NativePoolConnection } from 'mysql2/promise';
import { IConnection } from '../IConnection.js';
import { IDatabase } from '../IDatabase.js';
import { IMySqlPoolOptions } from '../IDbPoolOptions.js';

class MySqlConnection implements IConnection {
  constructor(private readonly conn: NativePoolConnection) {
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const [rows] = await this.conn.query(sql, params);
    return rows as T[];
  }

  async queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]> {
    const [rows] = await this.conn.query({ sql, rowsAsArray: true }, params);
    return rows as unknown[][];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    await this.conn.execute(sql, params as never);
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

export class MySqlDatabase implements IDatabase {
  private pool: Pool | null = null;

  constructor(private readonly options: IMySqlPoolOptions) {
  }

  private getPool(): Pool {
    if (!this.pool) {
      this.pool = mysql.createPool({
        host: this.options.host,
        port: this.options.port,
        user: this.options.username,
        password: this.options.password,
        database: this.options.database,
        connectionLimit: this.options.poolSize ?? 10,
        waitForConnections: true,
      });
    }
    return this.pool;
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const conn = await this.getConnection();
    try {
      const [rows] = await this.getPool().query(sql, params);
      return rows as T[];
    } finally {
      await this.releaseConnection(conn);
    }
  }

  async queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]> {
    const conn = await this.getConnection();
    try {
      const rows = await conn.query( sql, params);
      return rows as unknown as unknown[][];
    }
    finally {
      await this.releaseConnection(conn);
    }
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    const conn = await this.getConnection();
    try {
      await conn.execute(sql, params as never);
    }
    finally {
      await this.releaseConnection(conn);
    }
  }

  async getConnection(): Promise<IConnection> {
    const conn = await this.getPool().getConnection();
    return new MySqlConnection(conn);
  }

  async releaseConnection(connection: IConnection): Promise<void> {
    await connection.release();
  }

}
