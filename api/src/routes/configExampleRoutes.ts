import type { FastifyInstance } from "fastify";
import { appContainer } from "../container/registerDependencies.js";
import {
  configExampleQueryJsonSchema,
  configExampleQuerySchema,
  configExampleResponseJsonSchema
} from "../schemas/configExampleSchema.js";
import { ConfigExampleService } from "../services/configExampleService.js";

/**
 * Example routes demonstrating:
 * - Query parameter validation
 * - Proper OpenAPI schema definition
 * - Service dependency injection
 * - Using shared logger and options from infrastructure
 */
export async function configExampleRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/example/config",
    {
      schema: {
        tags: ["Examples"],
        summary: "Get API configuration example",
        description:
          "Demonstrates how to use shared infrastructure definitions in API endpoints, including:\n" +
          "- Dependency injection with tsyringe\n" +
          "- Using LoggerFactory from shared-infra\n" +
          "- Using ApiOptions from shared-infra\n" +
          "- Zod schema validation\n" +
          "- OpenAPI documentation",
        querystring: configExampleQueryJsonSchema,
        response: {
          200: {
            description: "Configuration information",
            ...configExampleResponseJsonSchema
          }
        }
      }
    },
    async (request) => {
      const query = configExampleQuerySchema.parse(request.query);
      const configExampleService = appContainer.resolve(ConfigExampleService);
      return configExampleService.getConfigInfo(query);
    }
  );
}

