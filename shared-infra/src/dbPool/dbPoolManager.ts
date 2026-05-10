import type { AppLogger } from "../logger/appLogger.js";
import { LoggerFactory } from "../logger/loggerFactory.js";
import type { Options } from "../config/Options.js";
import type { DbPoolManagerOptions } from "./dbPoolManagerOptions.js";
import type { Database } from "./database.js";
import type { DbPoolOptions } from "./dbPoolOptions.js";
import { DuckDbDatabase } from "./db/duckDbDatabase.js";
import { MySqlDatabase } from "./db/mySqlDatabase.js";
import { MariaDbDatabase } from "./db/mariaDbDatabase.js";

export class DbPoolManager {
  private readonly options: DbPoolManagerOptions;
  private readonly databases = new Map<string, Database>();
  private readonly logger: AppLogger;

  constructor(
    options: Options<DbPoolManagerOptions>,
    loggerFactory: LoggerFactory
  ) {
    this.options = options.value;
    this.logger = loggerFactory.create(DbPoolManager);
  }

  public getDatabase(name: string): Database {
    let db = this.databases.get(name);
    if (!db) {
      this.logger.info("Creating database instance", { connectionName: name });
      const connOptions = this.options.connections[name];
      if (!connOptions) {
        const available = Object.keys(this.options.connections).join(", ") || "(none)";
        throw new Error(
          `Database connection '${name}' is not configured. Available: ${available}`
        );
      }
      db = this.createDatabase(connOptions, name);
      this.databases.set(name, db);
      this.logger.info("Database instance created", { connectionName: name, kind: connOptions.kind });
    } else {
      this.logger.debug("Reusing database instance", { connectionName: name });
    }
    return db;
  }

  private createDatabase(options: DbPoolOptions, name: string): Database {
    const logger = this.logger.child({ component: "db-" + name, database: name, kind: options.kind });
    switch (options.kind) {
      case "duckdb":
        return new DuckDbDatabase(options, logger);
      case "mysql":
        return new MySqlDatabase(options, logger);
      case "mariadb":
        return new MariaDbDatabase(options, logger);
    }
  }
}

