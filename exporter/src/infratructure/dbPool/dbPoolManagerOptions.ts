import z from "zod";

import { IDbPoolOptions } from "./IDbPoolOptions";

export class DbPoolManagerOptions {
  public static readonly OptionsToken: string = "DbPoolManagerOptions";
  public static readonly SectionName: string = "database";

  public DefaultTimeout: number = 30000;
  public Connections: Record<string, IDbPoolOptions> = {};

  private static DbPoolConnectionSchema = z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    username: z.string().min(1),
    password: z.string(),
    database: z.string().min(1)
  });

  private static DbPoolManagerOptionsSchema = z.object({
    timeout: z.number().positive().default(30000),
    connections: z.record(z.string(), this.DbPoolConnectionSchema)
  });

  public static hydrate(raw: unknown): DbPoolManagerOptions {
    const parsed = this.DbPoolManagerOptionsSchema.parse(raw ?? {});
    const options = new DbPoolManagerOptions();
    options.DefaultTimeout = parsed.timeout;
    options.Connections = parsed.connections;
    return options;
  }

  public static validate(options: DbPoolManagerOptions): void {
    this.DbPoolManagerOptionsSchema.parse(options);
  }
}