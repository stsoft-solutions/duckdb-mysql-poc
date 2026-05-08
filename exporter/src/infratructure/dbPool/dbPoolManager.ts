import { inject, singleton } from "tsyringe";
import { Options } from "../config/Options.js";
import { DbPoolManagerOptions } from "./dbPoolManagerOptions.js";
import { Database } from "./database.js";
import { DbPoolOptions } from "./dbPoolOptions.js";
import { DuckDbDatabase } from "./db/duckDbDatabase.js";
import { MySqlDatabase } from "./db/mySqlDatabase.js";
import { MariaDbDatabase } from "./db/mariaDbDatabase.js";
import { LoggerFactory } from "../logger/loggerFactory.js";
import type { AppLogger } from "../logger/appLogger.js";

/**
 * Singleton that manages named database instances.
 *
 * Databases are created lazily on first access and cached for reuse.
 * Each named connection in the configuration maps to one {@link Database}
 * instance whose concrete type is determined by the `kind` field.
 *
 * @example
 * const db = container.resolve(DbPoolManager).getDatabase('main');
 * const rows = await db.query<User>('SELECT * FROM users WHERE id = ?', [1]);
 */
@singleton()
export class DbPoolManager {
  private readonly options: DbPoolManagerOptions;
  private readonly databases = new Map<string, Database>();
  private readonly logger: AppLogger;

  constructor(
    @inject(DbPoolManagerOptions.OptionsToken)
    options: Options<DbPoolManagerOptions>,
    @inject(LoggerFactory) loggerFactory: LoggerFactory
  ) {
    this.options = options.value;
    this.logger = loggerFactory.create(DbPoolManager);
  }

  /**
   * Returns the {@link Database} for the given connection name.
   * The instance is created once and reused on subsequent calls.
   *
   * @throws {Error} If no connection with `name` exists in the configuration.
   */
  public getDatabase(name: string): Database {
    let db = this.databases.get(name);
    if (!db) {
      const connOptions = this.options.connections[name];
      if (!connOptions) {
        const available = Object.keys(this.options.connections).join(', ') || '(none)';
        throw new Error(
          `Database connection '${name}' is not configured. Available: ${available}`
        );
      }
      db = this.createDatabase(connOptions, name);
      this.databases.set(name, db);
    }
    return db;
  }

  private createDatabase(options: DbPoolOptions, name: string): Database {
    const logger = this.logger.child({ component: 'db-' + name, database: name, kind: options.kind });
    switch (options.kind) {
      case 'duckdb':
        return new DuckDbDatabase(options, logger);
      case 'mysql':
        return new MySqlDatabase(options, logger);
      case 'mariadb':
        return new MariaDbDatabase(options, logger);
    }
  }
}
