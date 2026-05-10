import type { DependencyContainer } from "tsyringe";
import { LoggerFactory } from "../logger/loggerFactory.js";
import { DbPoolManager } from "./dbPoolManager.js";
import type { DbPoolManagerOptions } from "./dbPoolManagerOptions.js";
import { DbPoolManagerOptionsProvider } from "./dbPoolManagerOptions.js";
import type { Options } from "../config/Options.js";

export function registerDbPool(container: DependencyContainer): void {
  if (!container.isRegistered(DbPoolManager)) {
    container.register(DbPoolManager, {
      useFactory: (resolver) => new DbPoolManager(
        resolver.resolve<Options<DbPoolManagerOptions>>(DbPoolManagerOptionsProvider.OptionsToken),
        resolver.resolve(LoggerFactory)
      )
    });
  }
}

