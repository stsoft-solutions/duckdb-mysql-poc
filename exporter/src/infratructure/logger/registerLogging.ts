import { DependencyContainer, instanceCachingFactory } from "tsyringe";
import { Logger } from "./logger.js";
import { LoggerAccessor } from "./loggerAccessor.js";
import { RootLogger } from "./rootLogger.js";

export const LOGGER_TOKENS = {
  RootLogger: "RootLogger"
} as const;

export function registerLogging(container: DependencyContainer): void {
  container.registerSingleton(RootLogger);
  container.register<Logger>(LOGGER_TOKENS.RootLogger, {
    useFactory: instanceCachingFactory((resolver) => resolver.resolve(RootLogger))
  });
  container.registerSingleton(LoggerAccessor);
}
