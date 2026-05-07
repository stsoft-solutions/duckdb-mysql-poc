import { createPool, Pool, PoolConnection as NativePoolConnection } from 'mariadb';
import { IConnection } from '../IConnection';
import { IDatabase } from '../IDatabase';
import { IMariaDbPoolOptions } from '../IDbPoolOptions';
import type { AppLogger } from '../../logger/appLogger';
import { DatabaseConnectionBase } from './DatabaseConnectionBase';

class MariaDbConnection extends DatabaseConnectionBase {
  constructor(
    private readonly conn: NativePoolConnection,
    logger: AppLogger
  ) {
    super(logger);
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    this.logSql(sql);
    const rows = await this.conn.query(sql, params);
    return rows as T[];
  }

  async queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]> {
    this.logSql(sql);
    const rows = await this.conn.query(sql, params);
    return rows as unknown[][];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    this.logSql(sql);
    await this.conn.query(sql, params);
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

export class MariaDbDatabase implements IDatabase {
  private pool: Pool | null = null;

  constructor(
    private readonly options: IMariaDbPoolOptions,
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

  async getConnection(): Promise<IConnection> {
    const conn = await this.getPool().getConnection();
    return new MariaDbConnection(conn, this.logger);
  }

  async releaseConnection(connection: IConnection): Promise<void> {
    await connection.release();
  }

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
}
