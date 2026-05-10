import type { FastifyInstance, FastifyRequest } from "fastify";
import { appContainer, reloadConfiguration } from "../container/registerDependencies.js";
import {
  API_KEY_HEADER,
  apiKeyGuard,
  getApiConsumerFromRequest,
  requireApiKeyAndRoles,
} from "../hooks/apiKeyGuard.js";
import {
  authRateLimitGuard,
  sensitiveRateLimitGuard,
} from "../hooks/rateLimit.js";
import {
  analystQueryRequestJsonSchema,
  analystQueryRequestSchema,
  analystQueryResponseJsonSchema,
  configReloadResponseJsonSchema,
  forbiddenResponseJsonSchema,
  securedAdminReportResponseJsonSchema,
  securedAnalystInsightsResponseJsonSchema,
  securedProfileResponseJsonSchema,
  securedResourceQueryJsonSchema,
  securedResourceQuerySchema,
  securedResourceResponseJsonSchema,
  tooManyRequestsResponseJsonSchema,
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
      preHandler: [authRateLimitGuard, apiKeyGuard],
      schema: {
        tags: ["Examples"],
        summary: "Secured resource example",
        description:
          `Demonstrates API key authentication via the \`${API_KEY_HEADER}\` header.\n\n` +
          "**How to authenticate:**\n" +
          `Add the header \`${API_KEY_HEADER}: <your-key>\` to every request.\n\n` +
          "Keys are configured via `api.api_consumers` in `config/default.json5` " +
          "(or overridden in `config/local.json5`).\n\n" +
          "This endpoint is also rate limited per IP and per authenticated consumer.\n\n" +
          "**Default dev keys:** `dev-reader-key`, `dev-analyst-key`, `dev-admin-key`",
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
          429: {
            description: "Too many requests for this client IP or authenticated consumer",
            ...tooManyRequestsResponseJsonSchema,
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

  app.get(
    "/v1/example/secured/profile",
    {
      preHandler: [authRateLimitGuard, apiKeyGuard],
      schema: {
        tags: ["Examples"],
        summary: "Authenticated consumer profile",
        description:
          "Demonstrates API key authentication + role extraction. " +
          "This endpoint is rate limited per IP and per authenticated consumer. " +
          "Any valid API key can call this endpoint.",
        security: [{ apiKey: [] }],
        response: {
          200: {
            description: "Authenticated consumer information",
            ...securedProfileResponseJsonSchema,
          },
          401: {
            description: "Missing or invalid API key",
            ...unauthorizedResponseJsonSchema,
          },
          429: {
            description: "Too many requests for this client IP or authenticated consumer",
            ...tooManyRequestsResponseJsonSchema,
          },
        },
      },
    },
    async (request) => {
      const consumer = getApiConsumerFromRequest(request)!;
      return {
        consumer: {
          name: consumer.name,
          roles: consumer.roles,
        },
        message: "Authenticated with API key and resolved role set",
      };
    }
  );

  app.get(
    "/v1/example/secured/analyst-insights",
    {
      preHandler: [sensitiveRateLimitGuard, requireApiKeyAndRoles(["analyst"])],
      schema: {
        tags: ["Examples"],
        summary: "Analyst-only secured insights",
        description:
          "Demonstrates role-based authorization for the `analyst` role. " +
          "This endpoint is rate limited per IP and per authenticated consumer. " +
          "Consumers with `analyst` (or `admin`) can access this endpoint.",
        security: [{ apiKey: [] }],
        response: {
          200: {
            description: "Analyst insights returned successfully",
            ...securedAnalystInsightsResponseJsonSchema,
          },
          401: {
            description: "Missing or invalid API key",
            ...unauthorizedResponseJsonSchema,
          },
          403: {
            description: "API key is valid but does not have required role",
            ...forbiddenResponseJsonSchema,
          },
          429: {
            description: "Too many requests for this client IP or authenticated consumer",
            ...tooManyRequestsResponseJsonSchema,
          },
        },
      },
    },
    async () => {
      return {
        insights: {
          scope: "analyst" as const,
          totalSignals: 42,
          trend: "up" as const,
        },
      };
    }
  );

  app.get(
    "/v1/example/secured/admin-report",
    {
      preHandler: [sensitiveRateLimitGuard, requireApiKeyAndRoles(["admin"])],
      schema: {
        tags: ["Examples"],
        summary: "Admin-only secured report",
        description:
          "Demonstrates role-based authorization on top of API key authentication. " +
          "This endpoint is rate limited per IP and per authenticated consumer. " +
          "Only consumers that include the `admin` role can access this endpoint.",
        security: [{ apiKey: [] }],
        response: {
          200: {
            description: "Admin report returned successfully",
            ...securedAdminReportResponseJsonSchema,
          },
          401: {
            description: "Missing or invalid API key",
            ...unauthorizedResponseJsonSchema,
          },
          403: {
            description: "API key is valid but does not have required role",
            ...forbiddenResponseJsonSchema,
          },
          429: {
            description: "Too many requests for this client IP or authenticated consumer",
            ...tooManyRequestsResponseJsonSchema,
          },
        },
      },
    },
    async () => {
      return {
        report: {
          scope: "admin" as const,
          canRotateKeys: true,
          canViewAuditLogs: true,
        },
      };
    }
  );

  app.post(
    "/v1/example/secured/admin/reload-config",
    {
      preHandler: [sensitiveRateLimitGuard, requireApiKeyAndRoles(["admin"])],
      schema: {
        tags: ["Examples"],
        summary: "Admin-only configuration reload",
        description:
          "Reloads registered configuration sections and updates in-memory options monitors. " +
          "This endpoint is rate limited per IP and per authenticated consumer. " +
          "Only consumers with the `admin` role can invoke it.",
        security: [{ apiKey: [] }],
        response: {
          200: {
            description: "Configuration reloaded successfully",
            ...configReloadResponseJsonSchema,
          },
          401: {
            description: "Missing or invalid API key",
            ...unauthorizedResponseJsonSchema,
          },
          403: {
            description: "API key is valid but does not have required role",
            ...forbiddenResponseJsonSchema,
          },
          429: {
            description: "Too many requests for this client IP or authenticated consumer",
            ...tooManyRequestsResponseJsonSchema,
          },
        },
      },
    },
    async () => {
      reloadConfiguration();
      return {
        message: "Configuration reloaded",
        reloadedAt: new Date().toISOString(),
      };
    }
  );

  app.post(
    "/v1/example/secured/analyst-query",
    {
      preHandler: [sensitiveRateLimitGuard, requireApiKeyAndRoles(["analyst"])],
      schema: {
        tags: ["Examples"],
        summary: "Analyst-only POST with JSON body",
        description:
          "Demonstrates a secured POST endpoint with JSON body validation. " +
          "This endpoint is rate limited per IP and per authenticated consumer. " +
          "Requires a valid API key that has the `analyst` role.",
        security: [{ apiKey: [] }],
        body: analystQueryRequestJsonSchema,
        response: {
          200: {
            description: "Analyst query processed successfully",
            ...analystQueryResponseJsonSchema,
          },
          401: {
            description: "Missing or invalid API key",
            ...unauthorizedResponseJsonSchema,
          },
          403: {
            description: "API key is valid but does not have required role",
            ...forbiddenResponseJsonSchema,
          },
          429: {
            description: "Too many requests for this client IP or authenticated consumer",
            ...tooManyRequestsResponseJsonSchema,
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: unknown }>) => {
      const body = analystQueryRequestSchema.parse(request.body);
      return {
        query: {
          symbols: body.symbols,
          windowDays: body.windowDays,
          includeRaw: body.includeRaw,
          limit: body.limit,
        },
        summary: {
          matchedSymbols: body.symbols.length,
          generatedAt: new Date().toISOString(),
        },
      };
    }
  );
}

