import { DependencyContainer, instanceCachingFactory } from "tsyringe";
import { AppLogger } from "./appLogger.js";
import { RootLogger } from "./rootLogger.js";
import { LOGGER_TOKENS } from "./loggerTokens.js";

export { LOGGER_TOKENS };

export function registerLogging(container: DependencyContainer): void {
  container.register<AppLogger>(LOGGER_TOKENS.RootLogger, {
    useFactory: instanceCachingFactory((resolver) => resolver.resolve(RootLogger))
  });
}
