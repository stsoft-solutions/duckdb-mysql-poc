import { inject, singleton } from "tsyringe";
import { Options } from "../config/Options";
import { DbPoolManagerOptions } from "./dbPoolManagerOptions.js";

/**
 * A singleton class responsible for managing a database connection pool.
 * This class centralizes the configuration and management of database connections,
 * ensuring efficient allocation and reuse of resources.
 *
 * @class DbPoolManager
 * @decorator @singleton
 *
 * @constructor
 * @param {Options<DbPoolManagerOptions>} options - The configuration options for managing
 * the database connection pool. Injected as a dependency through the OptionsToken.
 *
 * @example
 * // Example usage of DbPoolManager in an application:
 * import { container } from "tsyringe";
 * import { DbPoolManager } from "./dbPoolManager.js";
 *
 * // Resolve the DbPoolManager instance from the dependency injection container.
 * const dbPoolManager = container.resolve(DbPoolManager);
 *
 * // Use dbPoolManager to manage database connections, execute queries, etc.
 * @example
 * // Example configuration for DbPoolManager in a config file (e.g., config/default.json):
 * {
 *   "database": {
 *     "default_timeout": 30000,
 *     "connections": {
 *       "main": {
 *         "host": "localhost",
 *         "port": 5432,
 *         "username": "user",
 *         "password": "pass",
 *         "database": "mydb"
 *       }
 *     }
 *   }
 * }
 * // Register the configuration options for DbPoolManager in the ConfigurationManager:
 * import { container } from "tsyringe";
 * import { ConfigurationManager } from "../config/configurationManager.js";
 * import { DbPoolManagerOptionsProvider } from "./dbPoolManagerOptionsProvider.js";
 *
 * const configurationManager = container.resolve(ConfigurationManager);
 * configurationManager.addOptions(DbPoolManagerOptionsProvider);
 */
@singleton()
export class DbPoolManager {
  private readonly options: DbPoolManagerOptions;

  constructor(@inject(DbPoolManagerOptions.OptionsToken) options: Options<DbPoolManagerOptions>) {
    this.options = options.value;
  }
}