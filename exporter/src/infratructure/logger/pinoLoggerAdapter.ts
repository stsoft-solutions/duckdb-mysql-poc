import { type Logger as PinoLogger } from "pino";
import { LogBindings } from "./logBindings";
import { AppLogger } from "./appLogger";

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export class PinoLoggerAdapter implements AppLogger {
  constructor(private readonly logger: PinoLogger) {}

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
    return new PinoLoggerAdapter(this.logger.child(bindings));
  }

  private log(level: LogLevel, arg1: string | LogBindings, arg2?: string): void {
    if (typeof arg1 === "string") {
      this.logger[level](arg1);
      return;
    }

    this.logger[level](arg1, arg2);
  }
}

