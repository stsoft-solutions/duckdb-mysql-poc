import { createPool, type Pool, type PoolConnection as NativePoolConnection } from 'mariadb';
import { performance } from 'node:perf_hooks';
import type { DatabaseConnection } from '../databaseConnection.js';
import type { Database } from '../database.js';
import type { MariaDbPoolOptions } from '../dbPoolOptions.js';
import type { AppLogger } from '../../logger/appLogger.js';
import { DatabaseConnectionBase } from './databaseConnectionBase.js';

class MariaDbConnection extends DatabaseConnectionBase {
  constructor(
    private readonly conn: NativePoolConnection,
    logger: AppLogger
  ) {
    super(logger);
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    this.logSql(sql, params);
    const startedAt = performance.now();
    const rows = await this.conn.query(sql, params);
    this.logger.debug('MariaDB query completed', {
      elapsedMs: DatabaseConnectionBase.elapsedMs(startedAt),
      rows: Array.isArray(rows) ? rows.length : undefined
    });
    return rows as T[];
  }

  async queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]> {
    this.logSql(sql, params);
    const startedAt = performance.now();
    const rows = await this.conn.query(sql, params);
    this.logger.debug('MariaDB raw query completed', {
      elapsedMs: DatabaseConnectionBase.elapsedMs(startedAt),
      rows: Array.isArray(rows) ? rows.length : undefined
    });
    return rows as unknown[][];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    this.logSql(sql, params);
    const startedAt = performance.now();
    await this.conn.query(sql, params);
    this.logger.debug('MariaDB statement completed', {
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
    await this.conn.release();
  }
}

export class MariaDbDatabase implements Database {
  private pool: Pool | null = null;

  constructor(
    private readonly options: MariaDbPoolOptions,
    private readonly logger: AppLogger
  ) {
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const connection = await this.getConnection();
    try {
      return await connection.query<T>(sql, params);
    } finally {
      await this.releaseConnection(connection);
    }
  }

  async queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]> {
    const connection = await this.getConnection();
    try {
      return await connection.queryRaw(sql, params);
    } finally {
      await this.releaseConnection(connection);
    }
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    const connection = await this.getConnection();
    try {
      await connection.execute(sql, params);
    } finally {
      await this.releaseConnection(connection);
    }
  }

  async getConnection(): Promise<DatabaseConnection> {
    const conn = await this.getPool().getConnection();
    return new MariaDbConnection(conn, this.logger);
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    await connection.release();
  }

  private getPool(): Pool {
    if (!this.pool) {
      this.logger.info('Creating MariaDB pool', {
        host: this.options.host,
        port: this.options.port,
        database: this.options.database,
        poolSize: this.options.poolSize ?? 10
      });
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
}
