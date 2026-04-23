import { z } from "zod";

import { IDbPoolOptions } from "./IDbPoolOptions.js";
import { OptionsTokenProvider } from "../config/optionsTokenProvider.js";

export class DbPoolManagerOptions {
  public static readonly OptionsToken: string = "DbPoolManagerOptions";
  public static readonly SectionName: string = "database";
  public static readonly Defaults: Record<string, unknown> = {
    default_timeout: 30000
  };

  public DefaultTimeout: number = 30000;
  public Connections: Record<string, IDbPoolOptions> = {};

  // ── Raw config schemas (snake_case, matches config files) ──────────────────

  private static RawClientServerSchema = z.object({
    kind: z.enum(['mariadb', 'mysql']),
    host: z.string().min(1),
    port: z.number().int().positive(),
    username: z.string().min(1),
    password: z.string(),
    database: z.string().min(1),
    pool_size: z.number().int().positive().optional(),
  }).strict();

  private static RawDuckDbSchema = z.object({
    kind: z.literal('duckdb'),
    path: z.string().min(1),
    access_mode: z.enum(['read_write', 'read_only']).optional(),
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

  // ── Hydrated schemas (camelCase, matches TS types) ─────────────────────────

  private static HydratedClientServerSchema = z.object({
    kind: z.enum(['mariadb', 'mysql']),
    host: z.string().min(1),
    port: z.number().int().positive(),
    username: z.string().min(1),
    password: z.string(),
    database: z.string().min(1),
    poolSize: z.number().int().positive().optional(),
  }).strict();

  private static HydratedDuckDbSchema = z.object({
    kind: z.literal('duckdb'),
    path: z.string().min(1),
    accessMode: z.enum(['read_write', 'read_only']).optional(),
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
    DefaultTimeout: z.number().positive(),
    Connections: z.record(z.string(), DbPoolManagerOptions.HydratedDbConnectionSchema),
  }).strict();

  // ── Hydration ──────────────────────────────────────────────────────────────

  private static hydrateConnection(
    raw: z.infer<typeof DbPoolManagerOptions.RawDbConnectionSchema>
  ): IDbPoolOptions {
    if (raw.kind === 'duckdb') {
      return { kind: 'duckdb', path: raw.path, accessMode: raw.access_mode };
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

  public static hydrate(raw: unknown): DbPoolManagerOptions {
    const parsed = this.RawDbPoolManagerConfigSchema.parse(raw ?? {});
    const options = new DbPoolManagerOptions();
    options.DefaultTimeout = parsed.default_timeout;
    options.Connections = Object.fromEntries(
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
}

export const DbPoolManagerOptionsProvider: OptionsTokenProvider<DbPoolManagerOptions> = {
  OptionsToken: DbPoolManagerOptions.OptionsToken,
  SectionName: DbPoolManagerOptions.SectionName,
  Defaults: DbPoolManagerOptions.Defaults,
  hydrate: (raw: unknown) => DbPoolManagerOptions.hydrate(raw),
  validate: (options: DbPoolManagerOptions) => DbPoolManagerOptions.validate(options)
};
