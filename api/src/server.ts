import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import { ZodError } from "zod";
import { echoRoutes } from "./routes/echoRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { configExampleRoutes } from "./routes/configExampleRoutes.js";
import { securedExampleRoutes } from "./routes/securedExampleRoutes.js";
import { API_KEY_HEADER } from "./hooks/apiKeyGuard.js";

type BuildServerRuntimeOptions = {
  validateResponses?: boolean;
};

export async function buildServer(
  options: FastifyServerOptions = {},
  runtimeOptions: BuildServerRuntimeOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify(options);
  const shouldValidateResponses = runtimeOptions.validateResponses ?? false;

  if (shouldValidateResponses) {
    const ajv = new Ajv.default({ allErrors: true, strict: false });
    const validatorCache = new WeakMap<object, ValidateFunction>();

    app.addHook("preSerialization", async (request, reply, payload) => {
      // Only validate JSON object/array payloads with declared response schemas.
      if (payload === null || payload === undefined || typeof payload !== "object") {
        return payload;
      }

      const schemaByStatusCode = reply.routeOptions.schema?.response;
      if (!schemaByStatusCode || typeof schemaByStatusCode !== "object") {
        return payload;
      }

      const responseSchemaMap = schemaByStatusCode as Record<string, unknown>;

      const statusCode = reply.statusCode;
      const statusKey = String(statusCode);
      const statusGroupKey = `${Math.floor(statusCode / 100)}xx`;
      const candidateSchema =
        responseSchemaMap[statusKey] ??
        responseSchemaMap[statusGroupKey] ??
        responseSchemaMap.default;

      if (!candidateSchema || typeof candidateSchema !== "object") {
        return payload;
      }

      const validator = getOrCreateValidator(candidateSchema, ajv, validatorCache);

      const isValid = validator(payload);
      if (isValid) {
        return payload;
      }

      request.log.error(
        {
          statusCode,
          url: request.url,
          validationErrors: formatAjvErrors(validator.errors),
        },
        "Response schema validation failed",
      );

      reply.code(500);
      return {
        message: "Internal Server Error",
        detail: "Response payload failed schema validation",
      };
    });
  }

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
        { name: "Echo", description: "Demo endpoints" },
        { name: "Examples", description: "Example endpoints demonstrating shared infrastructure usage" }
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: "apiKey",
            name: API_KEY_HEADER,
            in: "header",
            description: `API key passed as the \`${API_KEY_HEADER}\` header. Configured via \`api.api_key\` in config.`,
          },
        },
      },
    }
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });

  await app.register(healthRoutes);
  await app.register(echoRoutes);
  await app.register(configExampleRoutes);
  await app.register(securedExampleRoutes);

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

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) {
    return [];
  }

  return errors.map((error) => {
    const path = error.instancePath || "/";
    return `${path} ${error.message ?? "validation error"}`;
  });
}

function getOrCreateValidator(
  schema: object,
  ajv: InstanceType<typeof Ajv.default>,
  validatorCache: WeakMap<object, ValidateFunction>,
): ValidateFunction {
  const cached = validatorCache.get(schema);
  if (cached) {
    return cached;
  }

  const compiled = ajv.compile(schema);
  validatorCache.set(schema, compiled);
  return compiled;
}

