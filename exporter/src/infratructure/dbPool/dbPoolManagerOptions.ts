import { z } from "zod";

import { DbPoolOptions } from "./dbPoolOptions";
import { OptionsTokenProvider } from "../config/optionsTokenProvider";

export class DbPoolManagerOptions {
  public static readonly OptionsToken: string = "DbPoolManagerOptions";
  public static readonly SectionName: string = "database";
  public static readonly Defaults: Record<string, unknown> = {
    default_timeout: 30000
  };
  private static RawDuckDbStorageSchema = z.discriminatedUnion('mode', [
    z.object({
      mode: z.literal('memory'),
    }).strict(),
    z.object({
      mode: z.literal('file'),
      path: z.string().min(1),
    }).strict(),
  ]);
  private static RawDuckDbInitializationSchema = z.object({
    settings: z.record(
      z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
      z.union([z.string().min(1), z.number(), z.boolean()])
    ).optional(),
  }).strict();

  // ── Raw config schemas (snake_case, matches config files) ──────────────────
  private static RawDuckDbAttachmentSchema = z.object({
    type: z.literal('mysql'),
    alias: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    read_only: z.boolean().optional(),
    host: z.string().min(1),
    port: z.number().int().positive(),
    username: z.string().min(1),
    password: z.string(),
    database: z.string().min(1),
  }).strict();
  private static RawDuckDbSchema = z.object({
    kind: z.literal('duckdb'),
    storage: DbPoolManagerOptions.RawDuckDbStorageSchema,
    access_mode: z.enum(['read_write', 'read_only']).optional(),
    initialization: DbPoolManagerOptions.RawDuckDbInitializationSchema.optional(),
    extensions: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/)).optional(),
    attachments: z.array(DbPoolManagerOptions.RawDuckDbAttachmentSchema).optional(),
  }).strict();
  private static RawMariaDbSchema = z.object({
    kind: z.literal('mariadb'),
    host: z.string().min(1),
    port: z.number().int().positive(),
    username: z.string().min(1),
    password: z.string(),
    database: z.string().min(1),
    pool_size: z.number().int().positive().optional(),
  }).strict();
  private static RawMySqlSchema = z.object({
    kind: z.literal('mysql'),
    host: z.string().min(1),
    port: z.number().int().positive(),
    username: z.string().min(1),
    password: z.string(),
    database: z.string().min(1),
    pool_size: z.number().int().positive().optional(),
  }).strict();
  private static RawDbConnectionSchema = z.discriminatedUnion('kind', [
    DbPoolManagerOptions.RawMariaDbSchema,
    DbPoolManagerOptions.RawMySqlSchema,
    DbPoolManagerOptions.RawDuckDbSchema,
  ]);
  private static RawDbPoolManagerConfigSchema = z.object({
    default_timeout: z.number().positive().default(30000),
    connections: z.record(z.string(), DbPoolManagerOptions.RawDbConnectionSchema),
  }).strict();
  private static HydratedDuckDbStorageSchema = z.discriminatedUnion('mode', [
    z.object({
      mode: z.literal('memory'),
    }).strict(),
    z.object({
      mode: z.literal('file'),
      path: z.string().min(1),
    }).strict(),
  ]);
  private static HydratedDuckDbInitializationSchema = z.object({
    settings: z.record(
      z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
      z.union([z.string().min(1), z.number(), z.boolean()])
    ).optional(),
  }).strict();

  // ── Hydrated schemas (camelCase, matches TS types) ─────────────────────────
  private static HydratedDuckDbAttachmentSchema = z.object({
    type: z.literal('mysql'),
    alias: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    readOnly: z.boolean().optional(),
    host: z.string().min(1),
    port: z.number().int().positive(),
    username: z.string().min(1),
    password: z.string(),
    database: z.string().min(1),
  }).strict();
  private static HydratedDuckDbSchema = z.object({
    kind: z.literal('duckdb'),
    storage: DbPoolManagerOptions.HydratedDuckDbStorageSchema,
    accessMode: z.enum(['read_write', 'read_only']).optional(),
    initialization: DbPoolManagerOptions.HydratedDuckDbInitializationSchema.optional(),
    extensions: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/)).optional(),
    attachments: z.array(DbPoolManagerOptions.HydratedDuckDbAttachmentSchema).optional(),
  }).strict();
  private static HydratedMariaDbSchema = z.object({
    kind: z.literal('mariadb'),
    host: z.string().min(1),
    port: z.number().int().positive(),
    username: z.string().min(1),
    password: z.string(),
    database: z.string().min(1),
    poolSize: z.number().int().positive().optional(),
  }).strict();
  private static HydratedMySqlSchema = z.object({
    kind: z.literal('mysql'),
    host: z.string().min(1),
    port: z.number().int().positive(),
    username: z.string().min(1),
    password: z.string(),
    database: z.string().min(1),
    poolSize: z.number().int().positive().optional(),
  }).strict();
  private static HydratedDbConnectionSchema = z.discriminatedUnion('kind', [
    DbPoolManagerOptions.HydratedMariaDbSchema,
    DbPoolManagerOptions.HydratedMySqlSchema,
    DbPoolManagerOptions.HydratedDuckDbSchema,
  ]);
  private static HydratedDbPoolManagerOptionsSchema = z.object({
    defaultTimeout: z.number().positive(),
    connections: z.record(z.string(), DbPoolManagerOptions.HydratedDbConnectionSchema),
  }).strict();
  public defaultTimeout: number = 30000;
  public connections: Record<string, DbPoolOptions> = {};

  // ── Hydration ──────────────────────────────────────────────────────────────

  public static hydrate(raw: unknown): DbPoolManagerOptions {
    const parsed = this.RawDbPoolManagerConfigSchema.parse(raw ?? {});
    const options = new DbPoolManagerOptions();
    options.defaultTimeout = parsed.default_timeout;
    options.connections = Object.fromEntries(
      Object.entries(parsed.connections).map(([name, conn]) => [
        name,
        this.hydrateConnection(conn),
      ])
    );
    return options;
  }

  public static validate(options: DbPoolManagerOptions): void {
    this.HydratedDbPoolManagerOptionsSchema.parse(options);
  }

  private static hydrateConnection(
    raw: z.infer<typeof DbPoolManagerOptions.RawDbConnectionSchema>
  ): DbPoolOptions {
    if (raw.kind === 'duckdb') {
      return {
        kind: 'duckdb',
        storage: raw.storage,
        accessMode: raw.access_mode,
        initialization: raw.initialization
          ? {
            settings: raw.initialization.settings,
          }
          : undefined,
        extensions: raw.extensions,
        attachments: raw.attachments?.map(attachment => ({
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
      kind: raw.kind,
      host: raw.host,
      port: raw.port,
      username: raw.username,
      password: raw.password,
      database: raw.database,
      poolSize: raw.pool_size,
    };
  }
}

export const DbPoolManagerOptionsProvider: OptionsTokenProvider<DbPoolManagerOptions> = {
  OptionsToken: DbPoolManagerOptions.OptionsToken,
  SectionName: DbPoolManagerOptions.SectionName,
  Defaults: DbPoolManagerOptions.Defaults,
  hydrate: (raw: unknown) => DbPoolManagerOptions.hydrate(raw),
  validate: (options: DbPoolManagerOptions) => DbPoolManagerOptions.validate(options)
};
