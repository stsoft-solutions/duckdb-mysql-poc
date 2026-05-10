import { z } from "zod";
import type { OptionsTokenProvider } from "../config/optionsTokenProvider.js";

const RawPrettyOptionsSchema = z.object({
  colorize: z.boolean().default(true),
  ignore: z.string().default("pid,hostname,service,environment,level,time"),
  single_line: z.boolean().default(true),
  hide_object: z.boolean().default(true),
  hide_error_object: z.boolean().default(false),
}).strict();

const RawLoggerOptionsSchema = z.object({
  level: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  service_name: z.string().min(1).default("service"),
  environment: z.string().min(1).default(process.env.NODE_ENV ?? "development"),
  pretty: z.boolean().default(false),
  pretty_options: RawPrettyOptionsSchema.default({}),
  max_listeners: z.number().int().min(1).default(50),
}).strict();

export class PrettyOptions {
  constructor(
    public readonly colorize: boolean,
    public readonly ignore: string,
    public readonly singleLine: boolean,
    public readonly hideObject: boolean,
    public readonly hideErrorObject: boolean,
  ) {
  }
}

const HydratedLoggerOptionsSchema = z.object({
  level: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
  serviceName: z.string().min(1),
  environment: z.string().min(1),
  pretty: z.boolean(),
  maxListeners: z.number().int().min(1),
  prettyOptions: z.object({
    colorize: z.boolean(),
    ignore: z.string(),
    singleLine: z.boolean(),
    hideObject: z.boolean(),
    hideErrorObject: z.boolean(),
  }),
}).strict();

export class LoggerOptions {
  constructor(
    public readonly level: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent",
    public readonly serviceName: string,
    public readonly environment: string,
    public readonly pretty: boolean,
    public readonly maxListeners: number,
    public readonly prettyOptions: PrettyOptions,
  ) {
  }
}

export const LoggerOptionsProvider: OptionsTokenProvider<LoggerOptions> = {
  OptionsToken: "LoggerOptions",
  SectionName: "logger",
  Defaults: {
    level: "info",
    service_name: "service",
    environment: process.env.NODE_ENV ?? "development",
    pretty: false,
    pretty_options: {},
    max_listeners: 50,
  },
  hydrate: (raw: unknown) => {
    const parsed = RawLoggerOptionsSchema.parse(raw ?? {});
    return new LoggerOptions(
      parsed.level,
      parsed.service_name,
      parsed.environment,
      parsed.pretty,
      parsed.max_listeners,
      new PrettyOptions(
        parsed.pretty_options.colorize,
        parsed.pretty_options.ignore,
        parsed.pretty_options.single_line,
        parsed.pretty_options.hide_object,
        parsed.pretty_options.hide_error_object,
      ),
    );
  },
  validate: (options: LoggerOptions) => HydratedLoggerOptionsSchema.parse(options),
};

