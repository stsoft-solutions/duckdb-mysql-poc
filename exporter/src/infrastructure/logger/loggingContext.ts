import { AsyncLocalStorage } from "node:async_hooks";
import type { LogBindings } from "./logBindings.js";
import type { AppLogger } from "./appLogger.js";

type LoggingContextState = {
  logger: AppLogger;
  context: LogBindings;
};

const loggingContextStorage = new AsyncLocalStorage<LoggingContextState>();

export function getCurrentLogContextState(): LoggingContextState | undefined {
  return loggingContextStorage.getStore();
}

export function getCurrentLogContext(): LogBindings {
  return getCurrentLogContextState()?.context ?? {};
}

export function runWithLogContext<T>(baseLogger: AppLogger, context: LogBindings, callback: () => T): T {
  const current = getCurrentLogContextState();
  const parentLogger = current?.logger ?? baseLogger;
  const mergedContext = { ...(current?.context ?? {}), ...context };
  const scopedLogger = parentLogger.child(context);

  return loggingContextStorage.run(
    {
      logger: scopedLogger,
      context: mergedContext
    },
    callback
  );
}

export function runWithChildLogContext<T>(
  bindings: LogBindings,
  callback: () => T,
  fallbackRootLogger?: AppLogger
): T {
  const current = getCurrentLogContextState();

  if (current) {
    return runWithLogContext(current.logger, bindings, callback);
  }

  if (fallbackRootLogger) {
    return runWithLogContext(fallbackRootLogger, bindings, callback);
  }

  return callback();
}

