import type { FastifyInstance } from "fastify";
import { appContainer } from "../container/registerDependencies.js";
import { apiKeyGuard, API_KEY_HEADER } from "../hooks/apiKeyGuard.js";
import {
  securedResourceQueryJsonSchema,
  securedResourceQuerySchema,
  securedResourceResponseJsonSchema,
  unauthorizedResponseJsonSchema,
} from "../schemas/securedResourceSchema.js";
import { SecuredResourceService } from "../services/securedResourceService.js";

/**
 * Example secured routes demonstrating:
 * - API key authentication via X-Api-Key header
 * - OpenAPI security scheme definition
 * - preHandler guard reusable across any route
 * - 401 Unauthorized response documented in OpenAPI schema
 */
export async function securedExampleRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/example/secured",
    {
      preHandler: [apiKeyGuard],
      schema: {
        tags: ["Examples"],
        summary: "Secured resource example",
        description:
          `Demonstrates API key authentication via the \`${API_KEY_HEADER}\` header.\n\n` +
          "**How to authenticate:**\n" +
          `Add the header \`${API_KEY_HEADER}: <your-key>\` to every request.\n\n` +
          "The key is configured via `api.api_key` in `config/default.json5` " +
          "(or overridden in `config/local.json5`).\n\n" +
          "**Default dev key:** `dev-secret-key`",
        security: [{ apiKey: [] }],
        querystring: securedResourceQueryJsonSchema,
        response: {
          200: {
            description: "Secured resources returned successfully",
            ...securedResourceResponseJsonSchema,
          },
          401: {
            description: "Missing or invalid API key",
            ...unauthorizedResponseJsonSchema,
          },
        },
      },
    },
    async (request) => {
      const query = securedResourceQuerySchema.parse(request.query);
      const service = appContainer.resolve(SecuredResourceService);
      return service.getResources(query);
    }
  );
}

