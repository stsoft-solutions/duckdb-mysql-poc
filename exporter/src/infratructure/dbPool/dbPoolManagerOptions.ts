import { z } from "zod";

import { IDbPoolOptions } from "./IDbPoolOptions.js";
import {OptionsTokenProvider} from "../config/optionsTokenProvider";

export class DbPoolManagerOptions {
  public static readonly OptionsToken: string = "DbPoolManagerOptions";
  public static readonly SectionName: string = "database";
  public static readonly Defaults: Record<string, unknown> = {
    default_timeout: 30000
  };

  public DefaultTimeout: number = 30000;
  public Connections: Record<string, IDbPoolOptions> = {};

  private static DbPoolConnectionSchema = z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    username: z.string().min(1),
    password: z.string(),
    database: z.string().min(1)
  }).strict();

  // Raw config shape loaded from node-config.
  private static DbPoolManagerConfigSchema = z.object({
    default_timeout: z.number().positive().default(30000),
    connections: z.record(z.string(), this.DbPoolConnectionSchema)
  }).strict();

  // Hydrated shape consumed in code.
  private static HydratedDbPoolManagerOptionsSchema = z.object({
    DefaultTimeout: z.number().positive(),
    Connections: z.record(z.string(), this.DbPoolConnectionSchema)
  }).strict();

  public static hydrate(raw: unknown): DbPoolManagerOptions {
    const parsed = this.DbPoolManagerConfigSchema.parse(raw ?? {});
    const options = new DbPoolManagerOptions();
    options.DefaultTimeout = parsed.default_timeout;
    options.Connections = parsed.connections;
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