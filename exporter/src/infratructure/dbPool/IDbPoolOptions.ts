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

export type DuckDbStorageOptions =
  | {
      readonly mode: 'memory';
    }
  | {
      readonly mode: 'file';
      readonly path: string;
    };

export type DuckDbSettingValue = string | number | boolean;

export interface IDuckDbInitializationOptions {
  readonly settings?: Readonly<Record<string, DuckDbSettingValue>>;
}

export interface IDuckDbMySqlAttachmentOptions {
  readonly type: 'mysql';
  readonly alias: string;
  readonly readOnly?: boolean;
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: string;
}

export interface IDuckDbPoolOptions {
  readonly kind: 'duckdb';
  readonly storage: DuckDbStorageOptions;
  readonly accessMode?: 'read_write' | 'read_only';
  readonly initialization?: IDuckDbInitializationOptions;
  readonly extensions?: readonly string[];
  readonly attachments?: readonly IDuckDbMySqlAttachmentOptions[];
}

export type IDbPoolOptions = IMariaDbPoolOptions | IMySqlPoolOptions | IDuckDbPoolOptions;
