import { IConnection } from './IConnection.js';

export interface IDatabase {
  // Async — typed (columns mapped to object keys)
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  // Async — raw driver values (rows as arrays)
  queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  getConnection(): Promise<IConnection>;
  releaseConnection(connection: IConnection): Promise<void>;

  // Sync — typed
  querySync<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  // Sync — raw driver values
  queryRawSync(sql: string, params?: unknown[]): unknown[][];
  executeSync(sql: string, params?: unknown[]): void;
  getConnectionSync(): IConnection;
  releaseConnectionSync(connection: IConnection): void;
}
