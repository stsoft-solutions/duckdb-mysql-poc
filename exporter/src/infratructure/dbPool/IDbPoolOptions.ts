export type DbKind = 'mariadb' | 'mysql' | 'duckdb';

export interface IMariaDbPoolOptions {
  readonly kind: 'mariadb';
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: string;
  readonly poolSize?: number;
}

export interface IMySqlPoolOptions {
  readonly kind: 'mysql';
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: string;
  readonly poolSize?: number;
}

export interface IDuckDbPoolOptions {
  readonly kind: 'duckdb';
  readonly path: string;
  readonly accessMode?: 'read_write' | 'read_only';
}

export type IDbPoolOptions = IMariaDbPoolOptions | IMySqlPoolOptions | IDuckDbPoolOptions;
