import type { LogBindings } from "./logBindings.js";

export interface AppLogger {
  trace(message: string, bindings?: LogBindings): void;

  debug(message: string, bindings?: LogBindings): void;

  info(message: string, bindings?: LogBindings): void;

  warn(message: string, bindings?: LogBindings): void;

  error(message: string, bindings?: LogBindings): void;

  error(thrown: unknown, message?: string, bindings?: LogBindings): void;

  fatal(message: string, bindings?: LogBindings): void;

  fatal(thrown: unknown, message?: string, bindings?: LogBindings): void;

  child(bindings: LogBindings): AppLogger;
}
