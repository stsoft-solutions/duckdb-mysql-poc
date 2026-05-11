import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const sqlQueryRequestSchema = z.object({
  sql: z.string().min(1).max(100_000).default("SELECT 1"),
});

export const sqlQuerySuccessSchema = z.object({
  statementType: z.string(),
  rewrittenSql: z.string(),
  rowCount: z.number().int().nonnegative(),
  elapsedMs: z.number().int().nonnegative(),
  rows: z.array(z.record(z.unknown())),
});

export const sqlQueryErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  detail: z.string().optional(),
});

export type SqlQueryRequestDto = z.infer<typeof sqlQueryRequestSchema>;

export const sqlQueryRequestJsonSchema = zodToJsonSchema(sqlQueryRequestSchema, {
  target: "openApi3",
  $refStrategy: "none",
});

export const sqlQuerySuccessJsonSchema = zodToJsonSchema(sqlQuerySuccessSchema, {
  target: "openApi3",
  $refStrategy: "none",
});

export const sqlQueryErrorJsonSchema = zodToJsonSchema(sqlQueryErrorSchema, {
  target: "openApi3",
  $refStrategy: "none",
});

