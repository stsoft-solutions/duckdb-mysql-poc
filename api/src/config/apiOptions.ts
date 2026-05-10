import { z } from "zod";
import type { OptionsTokenProvider } from "@duckdb-poc/shared-infra";

export const ApiRoleSchema = z.enum(["reader", "analyst", "admin"]);

export const ApiConsumerSchema = z.object({
  name: z.string().min(1),
  api_key: z.string().min(1),
  roles: z.array(ApiRoleSchema).min(1),
}).strict();

export const ApiRateLimitBucketSchema = z.object({
  window_ms: z.number().int().positive().default(60_000),
  max_per_ip: z.number().int().positive(),
  max_per_consumer: z.number().int().positive(),
}).strict();

export const ApiRateLimitSchema = z.object({
  enabled: z.boolean().default(true),
  auth_endpoints: ApiRateLimitBucketSchema.default({
    window_ms: 60_000,
    max_per_ip: 20,
    max_per_consumer: 60,
  }),
  sensitive_endpoints: ApiRateLimitBucketSchema.default({
    window_ms: 60_000,
    max_per_ip: 10,
    max_per_consumer: 30,
  }),
}).strict();

const ApiOptionsSchema = z.object({
  host: z.string().min(1).default("0.0.0.0"),
  port: z.number().int().positive().default(3000),
  validate_responses: z.boolean().default(false),
  // Backward-compatible single key; prefer api_consumers for real usage.
  api_key: z.string().min(1).default("dev-secret-key"),
  api_consumers: z.array(ApiConsumerSchema).default([]),
  rate_limit: ApiRateLimitSchema.default({
    enabled: true,
    auth_endpoints: {
      window_ms: 60_000,
      max_per_ip: 20,
      max_per_consumer: 60,
    },
    sensitive_endpoints: {
      window_ms: 60_000,
      max_per_ip: 10,
      max_per_consumer: 30,
    },
  }),
}).strict();

export type ApiOptions = z.output<typeof ApiOptionsSchema>;

export const ApiOptionsProvider: OptionsTokenProvider<ApiOptions> = {
  OptionsToken: "ApiOptions",
  SectionName: "api",
  Defaults: {
    host: "0.0.0.0",
    port: 3000,
    validate_responses: false,
    api_key: "dev-secret-key",
    api_consumers: [],
    rate_limit: {
      enabled: true,
      auth_endpoints: {
        window_ms: 60_000,
        max_per_ip: 20,
        max_per_consumer: 60,
      },
      sensitive_endpoints: {
        window_ms: 60_000,
        max_per_ip: 10,
        max_per_consumer: 30,
      },
    },
  },
  hydrate: (raw: unknown) => ApiOptionsSchema.parse(raw ?? {})
};

