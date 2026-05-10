import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import { echoRoutes } from "./routes/echoRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";

export async function buildServer(options: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify(options);

  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "DuckDB MySQL POC API",
        description: "Initial REST API built with Fastify + TypeScript + Zod + tsyringe",
        version: "0.1.0"
      },
      tags: [
        { name: "Health", description: "Health endpoints" },
        { name: "Echo", description: "Demo endpoints" }
      ]
    }
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });

  await app.register(healthRoutes);
  await app.register(echoRoutes);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        message: "Validation error",
        issues: error.issues
      });
    }

    return reply.send(error);
  });

  return app;
}

