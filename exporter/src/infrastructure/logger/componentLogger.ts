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

  public error(message: string): void;
  public error(bindings: LogBindings, message?: string): void;
  public error(arg1: string | LogBindings, arg2?: string): void {
    this.log("error", arg1, arg2);
  }

  public fatal(message: string): void;
  public fatal(bindings: LogBindings, message?: string): void;
  public fatal(arg1: string | LogBindings, arg2?: string): void {
    this.log("fatal", arg1, arg2);
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
}
