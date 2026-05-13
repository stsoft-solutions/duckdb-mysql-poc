import type { FastifyInstance } from "fastify";
import { appContainer } from "../container/registerDependencies.js";
import { echoRequestJsonSchema, echoRequestSchema, echoResponseJsonSchema } from "../schemas/echoSchema.js";
import { EchoService } from "../services/echoService.js";

export async function echoRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: unknown }>(
    "/v1/echo",
    {
      schema: {
        tags: ["Echo"],
        summary: "Echo a message with optional repeat",
        body: echoRequestJsonSchema,
        response: {
          200: echoResponseJsonSchema
        }
      }
    },
    async (request) => {
      const body = echoRequestSchema.parse(request.body);
      const echoService = appContainer.resolve(EchoService);
      return echoService.echo(body);
    }
  );
}
