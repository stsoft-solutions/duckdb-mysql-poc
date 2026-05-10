import { FastifyInstance, FastifyRequest } from "fastify";
import { appContainer } from "../container/registerDependencies";
import {
  echoRequestJsonSchema,
  echoRequestSchema,
  echoResponseJsonSchema
} from "../schemas/echoSchema";
import { EchoService } from "../services/echoService";

export async function echoRoutes(app: FastifyInstance): Promise<void> {
  app.post(
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
    async (request: FastifyRequest<{ Body: unknown }>) => {
      const body = echoRequestSchema.parse(request.body);
      const echoService = appContainer.resolve(EchoService);
      return echoService.echo(body);
    }
  );
}

