import { inject, singleton } from "tsyringe";
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

  public static hydrate(raw: unknown): DbPoolManagerOptions {
    const source = this.asRecord(raw);
    const options = new DbPoolManagerOptions();

    const timeoutCandidate = source.default_timeout ?? source.DefaultTimeout;
    if (typeof timeoutCandidate === "number") {
      options.DefaultTimeout = timeoutCandidate;
    }

    const rawConnections = this.asRecord(source.connections);
    const hydratedConnections: Record<string, IDbPoolOptions> = {};
    for (const [name, connection] of Object.entries(rawConnections)) {
      if (this.isDbPoolOptions(connection)) {
        hydratedConnections[name] = connection;
      }
    }

    options.connections = hydratedConnections;

    return options;
  }

  public static validate(options: DbPoolManagerOptions): void {
    if (!Number.isFinite(options.DefaultTimeout) || options.DefaultTimeout <= 0) {
      throw new Error("database.default_timeout must be a positive number.");
    }

    for (const [connectionName, connection] of Object.entries(options.connections)) {
      if (!connection.host || !connection.database || !connection.username) {
        throw new Error(`database.connections.${connectionName} is missing required connection fields.`);
      }
    }
  }

  private static asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private static isDbPoolOptions(value: unknown): value is IDbPoolOptions {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const candidate = value as Partial<IDbPoolOptions>;
    return typeof candidate.host === "string"
      && typeof candidate.port === "number"
      && typeof candidate.username === "string"
      && typeof candidate.password === "string"
      && typeof candidate.database === "string";
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