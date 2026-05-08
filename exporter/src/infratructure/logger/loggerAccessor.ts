import { inject, singleton } from "tsyringe";
import { getCurrentLogContext, getCurrentLogContextState } from "./loggingContext.js";
import { LogBindings } from "./logBindings.js";
import { AppLogger } from "./appLogger.js";
import { LOGGER_TOKENS } from "./loggerTokens.js";

@singleton()
export class LoggerAccessor {
  constructor(@inject(LOGGER_TOKENS.RootLogger) private readonly rootLogger: AppLogger) {
  }

  public getLogger(): AppLogger {
    return getCurrentLogContextState()?.logger ?? this.rootLogger;
  }

  public getContext(): Readonly<LogBindings> {
    return Object.freeze({ ...getCurrentLogContext() });
  }
}

