import { FastifyInstance } from "fastify";
import { appContainer } from "../container/registerDependencies";
import { HealthService } from "../services/healthService";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Service health check",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              timestamp: { type: "string", format: "date-time" }
            },
            required: ["status", "timestamp"]
          }
        }
      }
    },
    async () => {
      const healthService = appContainer.resolve(HealthService);
      return healthService.getStatus();
    }
  );
}

