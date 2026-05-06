import { inject, singleton } from "tsyringe";
import { getCurrentLogContext, getCurrentLogContextState } from "./loggingContext";
import { LogBindings } from "./logBindings";
import { AppLogger } from "./appLogger";
import { LOGGER_TOKENS } from "./loggerTokens";

@singleton()
export class LoggerAccessor {
  constructor(@inject(LOGGER_TOKENS.RootLogger) private readonly rootLogger: AppLogger) {}

  public getLogger(): AppLogger {
    return getCurrentLogContextState()?.logger ?? this.rootLogger;
  }

  public getContext(): Readonly<LogBindings> {
    return Object.freeze({ ...getCurrentLogContext() });
  }
}

