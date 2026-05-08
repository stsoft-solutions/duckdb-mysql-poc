import { AppLogger } from "./appLogger.js";
import { LogBindings } from "./logBindings.js";
import { LoggerAccessor } from "./loggerAccessor.js";

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export class ComponentLogger implements AppLogger {
  constructor(
    private readonly loggerAccessor: LoggerAccessor,
    private readonly bindings: LogBindings
  ) {
  }

  public trace(message: string): void;
  public trace(bindings: LogBindings, message?: string): void;
  public trace(arg1: string | LogBindings, arg2?: string): void {
    this.log("trace", arg1, arg2);
  }

  public debug(message: string): void;
  public debug(bindings: LogBindings, message?: string): void;
  public debug(arg1: string | LogBindings, arg2?: string): void {
    this.log("debug", arg1, arg2);
  }

  public info(message: string): void;
  public info(bindings: LogBindings, message?: string): void;
  public info(arg1: string | LogBindings, arg2?: string): void {
    this.log("info", arg1, arg2);
  }

  public warn(message: string): void;
  public warn(bindings: LogBindings, message?: string): void;
  public warn(arg1: string | LogBindings, arg2?: string): void {
    this.log("warn", arg1, arg2);
  }

  public error(message: string, bindings?: LogBindings): void;
  public error(error: Error, message?: string, bindings?: LogBindings): void;
  public error(bindings: LogBindings, message?: string): void;
  public error(arg1: string | Error | LogBindings, arg2?: string | LogBindings, arg3?: LogBindings): void {
    const logger = this.loggerAccessor.getLogger().child(this.bindings);

    if (arg1 instanceof Error) {
      const message = typeof arg2 === "string" ? arg2 : arg1.message;
      const extra = this.asBindings(typeof arg2 === "object" ? arg2 : arg3);
      logger.error({ ...extra, err: arg1 }, message);
      return;
    }

    if (typeof arg1 === "string") {
      const bindings = this.asBindings(arg2);
      if (bindings) {
        logger.error(bindings, arg1);
      } else {
        logger.error(arg1);
      }
      return;
    }

    logger.error(arg1, typeof arg2 === "string" ? arg2 : undefined);
  }

  public fatal(message: string, bindings?: LogBindings): void;
  public fatal(error: Error, message?: string, bindings?: LogBindings): void;
  public fatal(bindings: LogBindings, message?: string): void;
  public fatal(arg1: string | Error | LogBindings, arg2?: string | LogBindings, arg3?: LogBindings): void {
    const logger = this.loggerAccessor.getLogger().child(this.bindings);

    if (arg1 instanceof Error) {
      const message = typeof arg2 === "string" ? arg2 : arg1.message;
      const extra = this.asBindings(typeof arg2 === "object" ? arg2 : arg3);
      logger.fatal({ ...extra, err: arg1 }, message);
      return;
    }

    if (typeof arg1 === "string") {
      const bindings = this.asBindings(arg2);
      if (bindings) {
        logger.fatal(bindings, arg1);
      } else {
        logger.fatal(arg1);
      }
      return;
    }

    logger.fatal(arg1, typeof arg2 === "string" ? arg2 : undefined);
  }

  public child(bindings: LogBindings): AppLogger {
    return new ComponentLogger(this.loggerAccessor, { ...this.bindings, ...bindings });
  }

  private log(level: LogLevel, arg1: string | LogBindings, arg2?: string): void {
    const logger = this.loggerAccessor.getLogger().child(this.bindings);

    if (typeof arg1 === "string") {
      logger[level](arg1);
      return;
    }

    logger[level](arg1, arg2);
  }

  private asBindings(value: unknown): LogBindings | undefined {
    if (value && typeof value === "object" && !(value instanceof Error)) {
      return value as LogBindings;
    }

    return undefined;
  }
}
