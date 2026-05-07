import pino, { type DestinationStream, type Logger as PinoLogger } from "pino";
import pretty from "pino-pretty";
import { cyan, gray, green, isColorSupported, magenta, red, yellow } from "colorette";
import { inject, singleton } from "tsyringe";
import { Options } from "../config/Options";
import { LoggerOptions, LoggerOptionsProvider } from "./loggerOptions";
import { PinoLoggerAdapter } from "./pinoLoggerAdapter";

const LEVEL_MAP: Record<string, { label: string; color: (text: string) => string }> = {
  trace: { label: "trace", color: gray },
  debug: { label: "debug", color: cyan },
  info: { label: "info", color: green },
  warn: { label: "warn", color: yellow },
  error: { label: "err", color: red },
  fatal: { label: "fatal", color: magenta },
};

@singleton()
export class RootLogger extends PinoLoggerAdapter {
  constructor(@inject(LoggerOptionsProvider.OptionsToken) options: Options<LoggerOptions>) {
    super(createRootPinoLogger(options.value));
  }
}

function createRootPinoLogger(options: LoggerOptions): PinoLogger {
  const opts = options.prettyOptions;
  const colorize = opts.colorize && isColorSupported;
  const hideObject = opts.hideObject;
  const hideErrorObject = opts.hideErrorObject;

  // Use an in-process stream instead of pino.transport() to avoid worker-thread
  // path resolution issues when the app is bundled (e.g. with ncc).
  const transport: DestinationStream = options.pretty
    ? pretty({
      colorize,
      hideObject,
      ignore: opts.ignore,
      singleLine: opts.singleLine,
      // Must match pino's messageKey so pino-pretty finds the message field.
      messageKey: "message",
      destination: process.stdout,
      sync: false,
      messageFormat(log, messageKey) {
        const ts = new Date(log["time"] as string).toISOString();
        const entry = LEVEL_MAP[log["level"] as string] ?? { label: "unknown", color: gray };
        const levelStr = colorize ? entry.color(`(${entry.label})`) : `(${entry.label})`;
        const ts_ = colorize ? gray(ts) : ts;

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

        return `${ts_} ${levelStr} ${comp}${log[messageKey]}${requestId}${errDetails}\n`;
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
