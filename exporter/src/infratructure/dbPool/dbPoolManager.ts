import { inject, singleton } from "tsyringe";
import { Options } from "../config/Options.js";
import { DbPoolManagerOptions } from "./dbPoolManagerOptions.js";
import { IDatabase } from "./IDatabase.js";
import { IDbPoolOptions } from "./IDbPoolOptions.js";
import { DuckDbDatabase } from "./db/DuckDbDatabase.js";
import { MySqlDatabase } from "./db/MySqlDatabase.js";
import { MariaDbDatabase } from "./db/MariaDbDatabase.js";

/**
 * Singleton that manages named database instances.
 *
 * Databases are created lazily on first access and cached for reuse.
 * Each named connection in the configuration maps to one {@link IDatabase}
 * instance whose concrete type is determined by the `kind` field.
 *
 * @example
 * const db = container.resolve(DbPoolManager).getDatabase('main');
 * const rows = await db.query<User>('SELECT * FROM users WHERE id = ?', [1]);
 */
@singleton()
export class DbPoolManager {
  private readonly options: DbPoolManagerOptions;
  private readonly databases = new Map<string, IDatabase>();

  constructor(
    @inject(DbPoolManagerOptions.OptionsToken)
    options: Options<DbPoolManagerOptions>
  ) {
    this.options = options.value;
  }

  /**
   * Returns the {@link IDatabase} for the given connection name.
   * The instance is created once and reused on subsequent calls.
   *
   * @throws {Error} If no connection with `name` exists in the configuration.
   */
  public getDatabase(name: string): IDatabase {
    let db = this.databases.get(name);
    if (!db) {
      const connOptions = this.options.Connections[name];
      if (!connOptions) {
        const available = Object.keys(this.options.Connections).join(', ') || '(none)';
        throw new Error(
          `Database connection '${name}' is not configured. Available: ${available}`
        );
      }
      db = DbPoolManager.createDatabase(connOptions);
      this.databases.set(name, db);
    }
    return db;
  }

  private static createDatabase(options: IDbPoolOptions): IDatabase {
    switch (options.kind) {
      case 'duckdb':  return new DuckDbDatabase(options);
      case 'mysql':   return new MySqlDatabase(options);
      case 'mariadb': return new MariaDbDatabase(options);
    }
  }
}
