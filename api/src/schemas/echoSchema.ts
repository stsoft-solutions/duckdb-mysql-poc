import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const echoRequestSchema = z.object({
  message: z.string().min(1).max(200),
  repeat: z.coerce.number().int().min(1).max(5).default(1)
});

export const echoResponseSchema = z.object({
  original: z.string(),
  repeat: z.number().int(),
  output: z.string()
});

export type EchoRequestDto = z.infer<typeof echoRequestSchema>;
export type EchoResponseDto = z.infer<typeof echoResponseSchema>;

export const echoRequestJsonSchema = zodToJsonSchema(echoRequestSchema, {
  target: "openApi3",
  $refStrategy: "none"
});

export const echoResponseJsonSchema = zodToJsonSchema(echoResponseSchema, {
  target: "openApi3",
  $refStrategy: "none"
});

