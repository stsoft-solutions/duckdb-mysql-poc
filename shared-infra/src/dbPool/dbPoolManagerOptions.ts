import { z } from "zod";

import type { DbPoolOptions } from "./dbPoolOptions.js";
import type { OptionsTokenProvider } from "../config/optionsTokenProvider.js";

const DbIdentifierSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const DuckDbSettingValueSchema = z.union([z.string().min(1), z.number(), z.boolean()]);

const DuckDbStorageSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("memory"),
  }).strict(),
  z.object({
    mode: z.literal("file"),
    path: z.string().min(1),
  }).strict(),
]);

const DuckDbInitializationSchema = z.object({
  settings: z.record(DbIdentifierSchema, DuckDbSettingValueSchema).optional(),
}).strict();

const DuckDbAttachmentSchema = z.object({
  type: z.literal("mysql"),
  alias: DbIdentifierSchema,
  read_only: z.boolean().optional(),
  host: z.string().min(1),
  port: z.number().int().positive(),
  username: z.string().min(1),
  password: z.string(),
  database: z.string().min(1),
}).strict();

const MariaDbConnectionSchema = z.object({
  kind: z.literal("mariadb"),
  host: z.string().min(1),
  port: z.number().int().positive(),
  username: z.string().min(1),
  password: z.string(),
  database: z.string().min(1),
  pool_size: z.number().int().positive().optional(),
}).strict();

const MySqlConnectionSchema = z.object({
  kind: z.literal("mysql"),
  host: z.string().min(1),
  port: z.number().int().positive(),
  username: z.string().min(1),
  password: z.string(),
  database: z.string().min(1),
  pool_size: z.number().int().positive().optional(),
}).strict();

const DuckDbConnectionSchema = z.object({
  kind: z.literal("duckdb"),
  storage: DuckDbStorageSchema,
  access_mode: z.enum(["read_write", "read_only"]).optional(),
  initialization: DuckDbInitializationSchema.optional(),
  extensions: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/)).optional(),
  attachments: z.array(DuckDbAttachmentSchema).optional(),
}).strict();

const DbConnectionSchema = z
  .discriminatedUnion("kind", [
    MariaDbConnectionSchema,
    MySqlConnectionSchema,
    DuckDbConnectionSchema,
  ])
  .transform((connection): DbPoolOptions => {
    if (connection.kind === "duckdb") {
      return {
        kind: "duckdb",
        storage: connection.storage,
        accessMode: connection.access_mode,
        initialization: connection.initialization,
        extensions: connection.extensions,
        attachments: connection.attachments?.map(attachment => ({
          type: attachment.type,
          alias: attachment.alias,
          readOnly: attachment.read_only,
          host: attachment.host,
          port: attachment.port,
          username: attachment.username,
          password: attachment.password,
          database: attachment.database,
        })),
      };
    }

    return {
      kind: connection.kind,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: connection.password,
      database: connection.database,
      poolSize: connection.pool_size,
    };
  });

const DbPoolManagerOptionsSchema = z
  .object({
    default_timeout: z.number().positive().default(30000),
    connections: z.record(z.string(), DbConnectionSchema),
  })
  .strict()
  .transform(data => ({
    defaultTimeout: data.default_timeout,
    connections: data.connections,
  }));

export type DbPoolManagerOptions = z.output<typeof DbPoolManagerOptionsSchema>;

export const DbPoolManagerOptionsProvider: OptionsTokenProvider<DbPoolManagerOptions> = {
  OptionsToken: "DbPoolManagerOptions",
  SectionName: "database",
  hydrate: (raw: unknown) => DbPoolManagerOptionsSchema.parse(raw ?? {})
};

