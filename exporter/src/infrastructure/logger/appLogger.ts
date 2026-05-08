import { LogBindings } from "./logBindings.js";

export interface AppLogger {
  trace(message: string): void;

  trace(bindings: LogBindings, message?: string): void;

  debug(message: string): void;

  debug(bindings: LogBindings, message?: string): void;

  info(message: string): void;

  info(bindings: LogBindings, message?: string): void;

  warn(message: string): void;

  warn(bindings: LogBindings, message?: string): void;

  error(message: string, bindings?: LogBindings): void;

  error(error: Error, message?: string, bindings?: LogBindings): void;

  error(bindings: LogBindings, message?: string): void;

  fatal(message: string, bindings?: LogBindings): void;

  fatal(error: Error, message?: string, bindings?: LogBindings): void;

  fatal(bindings: LogBindings, message?: string): void;

  child(bindings: LogBindings): AppLogger;
}
