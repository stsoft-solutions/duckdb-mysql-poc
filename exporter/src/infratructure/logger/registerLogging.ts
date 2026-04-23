import { DependencyContainer, instanceCachingFactory } from "tsyringe";
import { AppLogger } from "./appLogger";
import { LoggerAccessor } from "./loggerAccessor.js";
import { RootLogger } from "./rootLogger.js";
import { LOGGER_TOKENS } from "./loggerTokens.js";

export { LOGGER_TOKENS };

export function registerLogging(container: DependencyContainer): void {
  container.registerSingleton(RootLogger);
  container.register<AppLogger>(LOGGER_TOKENS.RootLogger, {
    useFactory: instanceCachingFactory((resolver) => resolver.resolve(RootLogger))
  });
  container.registerSingleton(LoggerAccessor);
}
