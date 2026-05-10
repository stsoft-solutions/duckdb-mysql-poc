import { z } from "zod";

const envSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info")
});

export type AppEnv = z.infer<typeof envSchema>;

export function readEnv(): AppEnv {
  return envSchema.parse(process.env);
}

