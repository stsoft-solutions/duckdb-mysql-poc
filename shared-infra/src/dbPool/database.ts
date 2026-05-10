import type { DatabaseConnection } from "./databaseConnection.js";

export interface Database {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;

  queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]>;

  execute(sql: string, params?: unknown[]): Promise<void>;

  getConnection(): Promise<DatabaseConnection>;

  releaseConnection(connection: DatabaseConnection): Promise<void>;
}

