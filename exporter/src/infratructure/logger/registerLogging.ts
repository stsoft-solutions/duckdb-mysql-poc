import { DependencyContainer, instanceCachingFactory } from "tsyringe";
import { AppLogger } from "./appLogger";
import { LoggerAccessor } from "./loggerAccessor";
import { LoggerFactory } from "./loggerFactory";
import { RootLogger } from "./rootLogger";
import { LOGGER_TOKENS } from "./loggerTokens";

export { LOGGER_TOKENS };

export function registerLogging(container: DependencyContainer): void {
  container.register<AppLogger>(LOGGER_TOKENS.RootLogger, {
    useFactory: instanceCachingFactory((resolver) => resolver.resolve(RootLogger))
  });
}
