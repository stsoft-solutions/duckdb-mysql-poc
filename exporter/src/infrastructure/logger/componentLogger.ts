import { AppLogger } from "./appLogger.js";
import { LogBindings } from "./logBindings.js";
import { LoggerAccessor } from "./loggerAccessor.js";

type LogLevel = "trace" | "debug" | "info" | "warn";
type FailureLevel = "error" | "fatal";

export class ComponentLogger implements AppLogger {
  constructor(
    private readonly loggerAccessor: LoggerAccessor,
    private readonly bindings: LogBindings
  ) {
  }

  public trace(message: string, bindings?: LogBindings): void {
    this.log("trace", message, bindings);
  }

  public debug(message: string, bindings?: LogBindings): void {
    this.log("debug", message, bindings);
  }

  public info(message: string, bindings?: LogBindings): void {
    this.log("info", message, bindings);
  }

  public warn(message: string, bindings?: LogBindings): void {
    this.log("warn", message, bindings);
  }

  public error(message: string, bindings?: LogBindings): void;
  public error(thrown: unknown, message?: string, bindings?: LogBindings): void;
  public error(arg1: unknown, arg2?: string | LogBindings, arg3?: LogBindings): void {
    this.logFailure("error", arg1, arg2, arg3);
  }

  public fatal(message: string, bindings?: LogBindings): void;
  public fatal(thrown: unknown, message?: string, bindings?: LogBindings): void;
  public fatal(arg1: unknown, arg2?: string | LogBindings, arg3?: LogBindings): void {
    this.logFailure("fatal", arg1, arg2, arg3);
  }

  public child(bindings: LogBindings): AppLogger {
    return new ComponentLogger(this.loggerAccessor, { ...this.bindings, ...bindings });
  }

  private log(level: LogLevel, message: string, bindings?: LogBindings): void {
    const logger = this.loggerAccessor.getLogger().child(this.bindings);
    this.emit(logger, level, message, bindings);
  }

  private logFailure(level: FailureLevel, arg1: unknown, arg2?: string | LogBindings, arg3?: LogBindings): void {
    const logger = this.loggerAccessor.getLogger().child(this.bindings);

    if (typeof arg1 === "string") {
      const bindings = this.asBindings(arg2);
      this.emit(logger, level, arg1, bindings);
      return;
    }

    const message = typeof arg2 === "string" ? arg2 : undefined;
    const bindings = this.asBindings(typeof arg2 === "object" ? arg2 : arg3) ?? {};

    if (arg1 instanceof Error) {
      this.emit(logger, level, message ?? arg1.message, { ...bindings, err: arg1 });
      return;
    }

    const error = new Error("Non-Error value was thrown");
    this.emit(logger, level, message ?? error.message, { ...bindings, err: error, thrownValue: arg1 });
  }

  private emit(logger: ReturnType<LoggerAccessor["getLogger"]>, level: LogLevel | FailureLevel, message: string, bindings?: LogBindings): void {
    switch (level) {
      case "trace":
        logger.trace(message, bindings);
        return;
      case "debug":
        logger.debug(message, bindings);
        return;
      case "info":
        logger.info(message, bindings);
        return;
      case "warn":
        logger.warn(message, bindings);
        return;
      case "error":
        logger.error(message, bindings);
        return;
      case "fatal":
        logger.fatal(message, bindings);
        return;
    }
  }

  private asBindings(value: unknown): LogBindings | undefined {
    if (value && typeof value === "object" && !(value instanceof Error)) {
      return value as LogBindings;
    }

    return undefined;
  }
}
