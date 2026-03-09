import { z } from "zod";
import { OptionsTokenProvider } from "../config/optionsTokenProvider.js";

const RawLoggerOptionsSchema = z.object({
  level: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  service_name: z.string().min(1).default("exporter"),
  environment: z.string().min(1).default(process.env.NODE_ENV ?? "development"),
  pretty: z.boolean().default(false)
}).strict();

const HydratedLoggerOptionsSchema = z.object({
  level: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
  serviceName: z.string().min(1),
  environment: z.string().min(1),
  pretty: z.boolean()
}).strict();

export class LoggerOptions {
  constructor(
    public readonly level: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent",
    public readonly serviceName: string,
    public readonly environment: string,
    public readonly pretty: boolean
  ) {
  }
}

export const LoggerOptionsProvider: OptionsTokenProvider<LoggerOptions> = {
  OptionsToken: "LoggerOptions",
  SectionName: "logger",
  Defaults: {
    level: "info",
    service_name: "exporter",
    environment: process.env.NODE_ENV ?? "development",
    pretty: false
  },
  hydrate: (raw: unknown) => {
    const parsed = RawLoggerOptionsSchema.parse(raw ?? {});
    return new LoggerOptions(parsed.level, parsed.service_name, parsed.environment, parsed.pretty);
  },
  validate: (options: LoggerOptions) => HydratedLoggerOptionsSchema.parse(options)
};

