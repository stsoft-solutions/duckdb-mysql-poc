import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const securedResourceQuerySchema = z.object({
  filter: z.string().optional().describe("Optional filter string"),
});

export const securedResourceResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.number().describe("Resource ID"),
      name: z.string().describe("Resource name"),
      secret: z.string().describe("Sensitive field only visible with valid API key"),
    })
  ).describe("List of secured resources"),
  meta: z.object({
    total: z.number().describe("Total count"),
    filter: z.string().optional().describe("Applied filter"),
  }).describe("Response metadata"),
});

export const unauthorizedResponseSchema = z.object({
  message: z.string(),
  detail: z.string(),
});

export const forbiddenResponseSchema = z.object({
  message: z.string(),
  detail: z.string(),
});

export const securedProfileResponseSchema = z.object({
  consumer: z.object({
    name: z.string(),
    roles: z.array(z.string()),
  }),
  message: z.string(),
});

export const securedAdminReportResponseSchema = z.object({
  report: z.object({
    scope: z.literal("admin"),
    canRotateKeys: z.boolean(),
    canViewAuditLogs: z.boolean(),
  }),
});

export const securedAnalystInsightsResponseSchema = z.object({
  insights: z.object({
    scope: z.literal("analyst"),
    totalSignals: z.number(),
    trend: z.enum(["up", "down", "flat"]),
  }),
});

export const analystQueryRequestSchema = z.object({
  symbols: z.array(z.string().min(1)).min(1).max(20),
  windowDays: z.number().int().min(1).max(365).default(30),
  includeRaw: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).optional().default(33).describe("Number of results returned, capped at 100")
});

export const analystQueryResponseSchema = z.object({
  query: z.object({
    symbols: z.array(z.string()),
    windowDays: z.number().int(),
    includeRaw: z.boolean(),
    limit: z.number().int(),
  }),
  summary: z.object({
    matchedSymbols: z.number().int(),
    generatedAt: z.string(),
  }),
});

export type SecuredResourceQueryDto = z.infer<typeof securedResourceQuerySchema>;
export type SecuredResourceResponseDto = z.infer<typeof securedResourceResponseSchema>;
export type AnalystQueryRequestDto = z.infer<typeof analystQueryRequestSchema>;

export const securedResourceQueryJsonSchema = zodToJsonSchema(securedResourceQuerySchema, {
  target: "openApi3",
  $refStrategy: "none",
});

export const securedResourceResponseJsonSchema = zodToJsonSchema(securedResourceResponseSchema, {
  target: "openApi3",
  $refStrategy: "none",
});

export const unauthorizedResponseJsonSchema = zodToJsonSchema(unauthorizedResponseSchema, {
  target: "openApi3",
  $refStrategy: "none",
});

export const forbiddenResponseJsonSchema = zodToJsonSchema(forbiddenResponseSchema, {
  target: "openApi3",
  $refStrategy: "none",
});

export const securedProfileResponseJsonSchema = zodToJsonSchema(securedProfileResponseSchema, {
  target: "openApi3",
  $refStrategy: "none",
});

export const securedAdminReportResponseJsonSchema = zodToJsonSchema(securedAdminReportResponseSchema, {
  target: "openApi3",
  $refStrategy: "none",
});

export const securedAnalystInsightsResponseJsonSchema = zodToJsonSchema(securedAnalystInsightsResponseSchema, {
  target: "openApi3",
  $refStrategy: "none",
});

export const analystQueryRequestJsonSchema = zodToJsonSchema(analystQueryRequestSchema, {
  target: "openApi3",
  $refStrategy: "none",
});

export const analystQueryResponseJsonSchema = zodToJsonSchema(analystQueryResponseSchema, {
  target: "openApi3",
  $refStrategy: "none",
});

