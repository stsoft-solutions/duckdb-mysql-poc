import { inject, singleton } from "tsyringe";
import { Options } from "../config/Options";
import { DbPoolManagerOptions } from "./dbPoolManagerOptions";
import { Database } from "./database";
import { DbPoolOptions } from "./dbPoolOptions";
import { DuckDbDatabase } from "./db/duckDbDatabase";
import { MySqlDatabase } from "./db/mySqlDatabase";
import { MariaDbDatabase } from "./db/mariaDbDatabase";
import { LoggerFactory } from "../logger/loggerFactory";
import type { AppLogger } from "../logger/appLogger";

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
