import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Example schema demonstrating:
 * - Query parameter validation with Zod
 * - Using shared infrastructure definitions in responses
 * - OpenAPI schema generation
 */

export const configExampleQuerySchema = z.object({
  includeDetails: z
    .boolean()
    .optional()
    .default(false)
});

export const configExampleResponseSchema = z.object({
  service: z.string().describe("Service name"),
  host: z.string().describe("Configured host address"),
  port: z.number().describe("Configured port number"),
  details: z
    .object({
      timestamp: z.string().datetime().describe("Response timestamp"),
      environment: z.string().describe("Environment context")
    })
    .optional()
    .describe("Additional details when requested")
});

export type ConfigExampleQueryDto = z.infer<typeof configExampleQuerySchema>;
export type ConfigExampleResponseDto = z.infer<
  typeof configExampleResponseSchema
>;

export const configExampleQueryJsonSchema = zodToJsonSchema(
  configExampleQuerySchema,
  {
    target: "openApi3",
    $refStrategy: "none"
  }
);

export const configExampleResponseJsonSchema = zodToJsonSchema(
  configExampleResponseSchema,
  {
    target: "openApi3",
    $refStrategy: "none"
  }
);


