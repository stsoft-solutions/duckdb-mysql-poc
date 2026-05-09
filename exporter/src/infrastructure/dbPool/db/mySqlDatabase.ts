import mysql, { type Pool, type PoolConnection as NativePoolConnection } from 'mysql2/promise';
import { performance } from 'node:perf_hooks';
import type { DatabaseConnection } from '../databaseConnection.js';
import type { Database } from '../database.js';
import type { MySqlPoolOptions } from '../dbPoolOptions.js';
import type { AppLogger } from '../../logger/appLogger.js';
import { DatabaseConnectionBase } from './databaseConnectionBase.js';

class MySqlConnection extends DatabaseConnectionBase {
  constructor(
    private readonly conn: NativePoolConnection,
    logger: AppLogger
  ) {
    super(logger);
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    this.logSql(sql, params);
    const startedAt = performance.now();
    const [rows] = await this.conn.query(sql, params);
    this.logger.debug('MySQL query completed', {
      elapsedMs: DatabaseConnectionBase.elapsedMs(startedAt),
      rows: Array.isArray(rows) ? rows.length : undefined
    });
    return rows as T[];
  }

  async queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]> {
    this.logSql(sql, params);
    const startedAt = performance.now();
    const [rows] = await this.conn.query({ sql, rowsAsArray: true }, params);
    this.logger.debug('MySQL raw query completed', {
      elapsedMs: DatabaseConnectionBase.elapsedMs(startedAt),
      rows: Array.isArray(rows) ? rows.length : undefined
    });
    return rows as unknown[][];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    this.logSql(sql, params);
    const startedAt = performance.now();
    await this.conn.execute(sql, params as never);
    this.logger.debug('MySQL statement completed', {
      elapsedMs: DatabaseConnectionBase.elapsedMs(startedAt)
    });
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

export class MySqlDatabase implements Database {
  private pool: Pool | null = null;

  constructor(
    private readonly options: MySqlPoolOptions,
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

  async getConnection(): Promise<DatabaseConnection> {
    const conn = await this.getPool().getConnection();
    return new MySqlConnection(conn, this.logger);
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    await connection.release();
  }

  private getPool(): Pool {
    if (!this.pool) {
      this.logger.info('Creating MySQL pool', {
        host: this.options.host,
        port: this.options.port,
        database: this.options.database,
        poolSize: this.options.poolSize ?? 10
      });
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
