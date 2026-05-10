import { z } from "zod";
import type { OptionsTokenProvider } from "@duckdb-poc/shared-infra";

export const ApiRoleSchema = z.enum(["reader", "analyst", "admin"]);

export const ApiConsumerSchema = z.object({
  name: z.string().min(1),
  api_key: z.string().min(1),
  roles: z.array(ApiRoleSchema).min(1),
}).strict();

const ApiOptionsSchema = z.object({
  host: z.string().min(1).default("0.0.0.0"),
  port: z.number().int().positive().default(3000),
  // Backward-compatible single key; prefer api_consumers for real usage.
  api_key: z.string().min(1).default("dev-secret-key"),
  api_consumers: z.array(ApiConsumerSchema).default([]),
}).strict();

export type ApiOptions = z.output<typeof ApiOptionsSchema>;

export const ApiOptionsProvider: OptionsTokenProvider<ApiOptions> = {
  OptionsToken: "ApiOptions",
  SectionName: "api",
  Defaults: {
    host: "0.0.0.0",
    port: 3000,
    api_key: "dev-secret-key",
    api_consumers: [],
  },
  hydrate: (raw: unknown) => ApiOptionsSchema.parse(raw ?? {})
};

