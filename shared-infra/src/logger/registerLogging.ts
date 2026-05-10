import type { DependencyContainer } from "tsyringe";
import type { AppLogger } from "./appLogger.js";
import { RootLogger } from "./rootLogger.js";
import { LOGGER_TOKENS } from "./loggerTokens.js";
import { LoggerAccessor } from "./loggerAccessor.js";
import { LoggerFactory } from "./loggerFactory.js";
import { LoggerOptions, LoggerOptionsProvider } from "./loggerOptions.js";
import type { Options } from "../config/Options.js";

export { LOGGER_TOKENS };

export function registerLogging(container: DependencyContainer): void {
  if (!container.isRegistered(LOGGER_TOKENS.RootLogger)) {
    container.register<AppLogger>(LOGGER_TOKENS.RootLogger, {
      useFactory: (resolver) => new RootLogger(
        resolver.resolve<Options<LoggerOptions>>(LoggerOptionsProvider.OptionsToken)
      )
    });
  }

  if (!container.isRegistered(LoggerAccessor)) {
    container.register(LoggerAccessor, {
      useFactory: (resolver) => new LoggerAccessor(
        resolver.resolve<AppLogger>(LOGGER_TOKENS.RootLogger)
      )
    });
  }

  if (!container.isRegistered(LoggerFactory)) {
    container.register(LoggerFactory, {
      useFactory: (resolver) => new LoggerFactory(
        resolver.resolve(LoggerAccessor)
      )
    });
  }
}

