export interface DatabaseConnection {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;

  queryRaw(sql: string, params?: unknown[]): Promise<unknown[][]>;

  execute(sql: string, params?: unknown[]): Promise<void>;

  beginTransaction(): Promise<void>;

  commit(): Promise<void>;

  rollback(): Promise<void>;

  release(): Promise<void>;
}

