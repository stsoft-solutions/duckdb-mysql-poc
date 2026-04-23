import pino, { type Logger as PinoLogger, type LoggerOptions as PinoLoggerOptions } from "pino";
import { inject, singleton } from "tsyringe";
import { Options } from "../config/Options.js";
import { LoggerOptions, LoggerOptionsProvider } from "./loggerOptions.js";
import { PinoLoggerAdapter } from "./pinoLoggerAdapter.js";

@singleton()
export class RootLogger extends PinoLoggerAdapter {
  constructor(@inject(LoggerOptionsProvider.OptionsToken) options: Options<LoggerOptions>) {
    super(createRootPinoLogger(options.value));
  }
}

function createRootPinoLogger(options: LoggerOptions): PinoLogger {
  const loggerOptions: PinoLoggerOptions = {
    level: options.level,
    base: {
      service: options.serviceName,
      environment: options.environment
    },
    messageKey: "message"
  };

  if (options.pretty) {
    loggerOptions.transport = {
      target: "pino-pretty",
      options: {
        translateTime: "SYS:standard"
      }
    };
  }

  return pino(loggerOptions);
}

