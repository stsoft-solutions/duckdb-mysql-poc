import pino, { type DestinationStream, type Logger as PinoLogger } from "pino";
import pretty from "pino-pretty";
import { cyan, gray, green, isColorSupported, magenta, red, yellow } from "colorette";
import type { Options } from "../config/Options.js";
import { LoggerOptions } from "./loggerOptions.js";
import { PinoLoggerAdapter } from "./pinoLoggerAdapter.js";

const LEVEL_MAP: Record<string, { label: string; color: (text: string) => string }> = {
  trace: { label: "trace", color: gray },
  debug: { label: "debug", color: cyan },
  info: { label: "info", color: green },
  warn: { label: "warn", color: yellow },
  error: { label: "err", color: red },
  fatal: { label: "fatal", color: magenta },
};

export class RootLogger extends PinoLoggerAdapter {
  constructor(options: Options<LoggerOptions>) {
    super(createRootPinoLogger(options.value));
  }
}

function createRootPinoLogger(options: LoggerOptions): PinoLogger {
  const opts = options.prettyOptions;
  const colorize = opts.colorize && isColorSupported;
  const hideObject = opts.hideObject;
  const hideErrorObject = opts.hideErrorObject;

  // Increase max listeners to prevent spurious memory leak warnings when using pino-pretty with async mode.
  // Child loggers and network sockets can accumulate listeners on stdout/stderr/sockets when handling
  // multiple concurrent requests. Default maxListeners (10) is too low for typical applications.
  // This value is configurable via logger.max_listeners in config.
  process.setMaxListeners(options.maxListeners);
  process.stdout.setMaxListeners(options.maxListeners);
  process.stderr.setMaxListeners(options.maxListeners);

  const transport: DestinationStream = options.pretty
    ? pretty({
      colorize,
      hideObject,
      ignore: opts.ignore,
      singleLine: opts.singleLine,
      messageKey: "message",
      destination: process.stdout,
      sync: false,
      messageFormat(log, messageKey) {
        const ts = new Date(log["time"] as string).toISOString();
        const entry = LEVEL_MAP[log["level"] as string] ?? { label: "unknown", color: gray };
        const levelStr = colorize ? entry.color(`(${entry.label})`) : `(${entry.label})`;
        const tsStr = colorize ? gray(ts) : ts;

        const component = log["component"] as string | undefined;
        const comp = hideObject
          ? (component ? (colorize ? magenta(component) : component) : "") + ": "
          : "";

        const err = log["err"] as { stack?: string; type?: string; message?: string } | undefined;
        const errDetails =
          hideObject && !hideErrorObject && err
            ? (() => {
              const errText = err.stack ?? `${err.type}: ${err.message}`;
              return colorize ? `\n${red(errText)}` : `\n${errText}`;
            })()
            : "";

        let requestId = "";
        if (hideObject) {
          if (log["requestId"]) {
            requestId = ` [${log["requestId"]}]`;
          } else if (log["runId"]) {
            requestId = ` [${log["runId"]}]`;
          }
        }

        return `${tsStr} ${levelStr} ${comp}${log[messageKey]}${requestId}${errDetails}\n`;
      },
    })
    : pino.destination({ dest: 1, sync: false, minLength: 0 });

  return pino(
    {
      level: options.level,
      base: {
        service: options.serviceName,
        environment: options.environment,
      },
      messageKey: "message",
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level(label) {
          return { level: label };
        },
      },
      serializers: {
        err: pino.stdSerializers.err,
      },
    },
    transport,
  );
}

