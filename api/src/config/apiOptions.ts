import { z } from "zod";
import type { OptionsTokenProvider } from "@duckdb-poc/shared-infra";

const ApiOptionsSchema = z.object({
  host: z.string().min(1).default("0.0.0.0"),
  port: z.number().int().positive().default(3000),
  api_key: z.string().min(1).default("dev-secret-key"),
}).strict();

export type ApiOptions = z.output<typeof ApiOptionsSchema>;

export const ApiOptionsProvider: OptionsTokenProvider<ApiOptions> = {
  OptionsToken: "ApiOptions",
  SectionName: "api",
  Defaults: {
    host: "0.0.0.0",
    port: 3000,
    api_key: "dev-secret-key",
  },
  hydrate: (raw: unknown) => ApiOptionsSchema.parse(raw ?? {})
};

