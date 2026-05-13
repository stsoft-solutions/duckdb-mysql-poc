import { getCurrentLogContext, getCurrentLogContextState } from "./loggingContext.js";
import type { LogBindings } from "./logBindings.js";
import type { AppLogger } from "./appLogger.js";

export class LoggerAccessor {
  constructor(private readonly rootLogger: AppLogger) {
  }

  public getLogger(): AppLogger {
    return getCurrentLogContextState()?.logger ?? this.rootLogger;
  }

  public getContext(): Readonly<LogBindings> {
    return Object.freeze({ ...getCurrentLogContext() });
  }
}

