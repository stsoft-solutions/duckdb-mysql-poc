import { inject, singleton } from "tsyringe";
import { z } from "zod";
import { IOptions, OptionsTokenProvider } from "../config/configurationManager.js";

export interface IDbPoolOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export class DbPoolManagerOptions {
  public static readonly OptionsToken: string = "DbPoolManagerOptions";
  public static readonly SectionName: string = "database";
  public static readonly Defaults: Record<string, unknown> = {
    default_timeout: 30000,
    connections: {}
  };

  public DefaultTimeout: number = 30000;
  public connections: Record<string, IDbPoolOptions> = {};

  private static DbPoolConnectionSchema = z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    username: z.string().min(1),
    password: z.string(),
    database: z.string().min(1)
  });

  private static DbPoolManagerConfigSchema = z.object({
    default_timeout: z.number().positive().default(30000),
    connections: z.record(z.string(), this.DbPoolConnectionSchema).default({})
  });

  private static DbPoolManagerOptionsSchema = z.object({
    DefaultTimeout: z.number().positive(),
    connections: z.record(z.string(), this.DbPoolConnectionSchema)
  });

  public static hydrate(raw: unknown): DbPoolManagerOptions {
    const parsed = this.DbPoolManagerConfigSchema.parse(raw ?? {});
    const options = new DbPoolManagerOptions();
    options.DefaultTimeout = parsed.default_timeout;
    options.connections = parsed.connections;
    return options;
  }

  public static validate(options: DbPoolManagerOptions): void {
    this.DbPoolManagerOptionsSchema.parse(options);
  }
}

export const DbPoolManagerOptionsProvider: OptionsTokenProvider<DbPoolManagerOptions> = {
  OptionsToken: DbPoolManagerOptions.OptionsToken,
  SectionName: DbPoolManagerOptions.SectionName,
  Defaults: DbPoolManagerOptions.Defaults,
  hydrate: (raw) => DbPoolManagerOptions.hydrate(raw),
  validate: (options) => DbPoolManagerOptions.validate(options)
};

@singleton()
export class DbPoolManager {
  constructor(@inject(DbPoolManagerOptions.OptionsToken) private readonly options: IOptions<DbPoolManagerOptions>) {
    const resolvedOptions = this.options.get();
    console.log("Initializing database pools:", Object.keys(resolvedOptions.connections));
  }

}