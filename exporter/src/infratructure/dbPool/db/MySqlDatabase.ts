import mysql, { Pool, PoolConnection as NativePoolConnection } from 'mysql2/promise';
import { IConnection } from '../IConnection';
import { IDatabase } from '../IDatabase';
import { IMySqlPoolOptions } from '../IDbPoolOptions';
import type { AppLogger } from '../../logger/appLogger';
import { DatabaseConnectionBase } from './DatabaseConnectionBase';

class MySqlConnection extends DatabaseConnectionBase {
  constructor(
    private readonly conn: NativePoolConnection,
    logger: AppLogger
  ) {
    super(logger);
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    this.logSql(sql);
    const [rows] = await this.conn.query(sql, params);
    return rows as T[];
  }

  async queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]> {
    this.logSql(sql);
    const [rows] = await this.conn.query({ sql, rowsAsArray: true }, params);
    return rows as unknown[][];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    this.logSql(sql);
    await this.conn.execute(sql, params as never);
  }

  async beginTransaction(): Promise<void> {
    this.logSql('BEGIN TRANSACTION');
    await this.conn.beginTransaction();
  }

  async commit(): Promise<void> {
    this.logSql('COMMIT');
    await this.conn.commit();
  }

  async rollback(): Promise<void> {
    this.logSql('ROLLBACK');
    await this.conn.rollback();
  }

  async release(): Promise<void> {
    this.conn.release();
  }
}

export class MySqlDatabase implements IDatabase {
  private pool: Pool | null = null;

  constructor(
    private readonly options: IMySqlPoolOptions,
    private readonly logger: AppLogger
  ) {
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const conn = await this.getConnection();
    try {
      return await conn.query<T>(sql, params);
    } finally {
      await this.releaseConnection(conn);
    }
  }

  async queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]> {
    const conn = await this.getConnection();
    try {
      return await conn.queryRaw(sql, params);
    } finally {
      await this.releaseConnection(conn);
    }
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    const conn = await this.getConnection();
    try {
      await conn.execute(sql, params as never);
    } finally {
      await this.releaseConnection(conn);
    }
  }

  async getConnection(): Promise<IConnection> {
    const conn = await this.getPool().getConnection();
    return new MySqlConnection(conn, this.logger);
  }

  async releaseConnection(connection: IConnection): Promise<void> {
    await connection.release();
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

}
