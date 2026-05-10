import { z } from "zod";
import type { OptionsTokenProvider } from "@duckdb-poc/shared-infra";

const ApiOptionsSchema = z.object({
  host: z.string().min(1).default("0.0.0.0"),
  port: z.number().int().positive().default(3000)
}).strict();

export type ApiOptions = z.output<typeof ApiOptionsSchema>;

export const ApiOptionsProvider: OptionsTokenProvider<ApiOptions> = {
  OptionsToken: "ApiOptions",
  SectionName: "api",
  hydrate: (raw: unknown) => ApiOptionsSchema.parse(raw ?? {})
};

