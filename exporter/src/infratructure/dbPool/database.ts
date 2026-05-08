import { DatabaseConnection } from './databaseConnection';

export interface Database {
  // Typed columns mapped to object keys.
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;

  // Raw driver values, with rows returned as arrays.
  queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]>;

  execute(sql: string, params?: unknown[]): Promise<void>;

  getConnection(): Promise<DatabaseConnection>;

  releaseConnection(connection: DatabaseConnection): Promise<void>;
}
