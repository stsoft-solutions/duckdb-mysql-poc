import { IConnection } from './IConnection';

export interface IDatabase {
  // Typed — columns mapped to object keys
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;

  // Raw driver values — rows as arrays
  queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]>;

  execute(sql: string, params?: unknown[]): Promise<void>;

  getConnection(): Promise<IConnection>;

  releaseConnection(connection: IConnection): Promise<void>;
}
