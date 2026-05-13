import { type Logger as PinoLogger } from "pino";
import type { LogBindings } from "./logBindings.js";
import type { AppLogger } from "./appLogger.js";

type LogLevel = "trace" | "debug" | "info" | "warn";
type FailureLevel = "error" | "fatal";

export class PinoLoggerAdapter implements AppLogger {
  constructor(private readonly logger: PinoLogger) {
  }

  public toPinoLogger(): PinoLogger {
    return this.logger;
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
    return new PinoLoggerAdapter(this.logger.child(bindings));
  }

  private log(level: LogLevel, message: string, bindings?: LogBindings): void {
    if (bindings) {
      this.logger[level](bindings, message);
      return;
    }

    this.logger[level](message);
  }

  private logFailure(level: FailureLevel, arg1: unknown, arg2?: string | LogBindings, arg3?: LogBindings): void {
    if (typeof arg1 === "string") {
      const bindings = this.asBindings(arg2);
      if (bindings) {
        this.logger[level](bindings, arg1);
      } else {
        this.logger[level](arg1);
      }
      return;
    }

    const message = typeof arg2 === "string" ? arg2 : undefined;
    const bindings = this.asBindings(typeof arg2 === "object" ? arg2 : arg3) ?? {};

    if (arg1 instanceof Error) {
      this.logger[level]({ ...bindings, err: arg1 }, message ?? arg1.message);
      return;
    }

    const error = new Error("Non-Error value was thrown");
    this.logger[level]({ ...bindings, err: error, thrownValue: arg1 }, message ?? error.message);
  }

  private asBindings(value: unknown): LogBindings | undefined {
    if (value && typeof value === "object" && !(value instanceof Error)) {
      return value as LogBindings;
    }

    return undefined;
  }
}

