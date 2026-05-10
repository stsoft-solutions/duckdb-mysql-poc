export type DbKind = "mariadb" | "mysql" | "duckdb";

export interface MariaDbPoolOptions {
  readonly kind: "mariadb";
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: string;
  readonly poolSize?: number;
}

export interface MySqlPoolOptions {
  readonly kind: "mysql";
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: string;
  readonly poolSize?: number;
}

export type DuckDbStorageOptions =
  | {
    readonly mode: "memory";
  }
  | {
    readonly mode: "file";
    readonly path: string;
  };

export type DuckDbSettingValue = string | number | boolean;

export interface DuckDbInitializationOptions {
  readonly settings?: Readonly<Record<string, DuckDbSettingValue>>;
}

export interface DuckDbMySqlAttachmentOptions {
  readonly type: "mysql";
  readonly alias: string;
  readonly readOnly?: boolean;
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: string;
}

export interface DuckDbPoolOptions {
  readonly kind: "duckdb";
  readonly storage: DuckDbStorageOptions;
  readonly accessMode?: "read_write" | "read_only";
  readonly initialization?: DuckDbInitializationOptions;
  readonly extensions?: readonly string[];
  readonly attachments?: readonly DuckDbMySqlAttachmentOptions[];
}

export type DbPoolOptions = MariaDbPoolOptions | MySqlPoolOptions | DuckDbPoolOptions;

