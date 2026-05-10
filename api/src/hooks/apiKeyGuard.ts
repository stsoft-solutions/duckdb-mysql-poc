import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import {
  findApiKeyPrincipal,
  getMissingRoles,
  getOptionsMonitorToken,
  type ApiKeyPrincipal,
  type OptionsMonitor
} from "@duckdb-poc/shared-infra";
import { appContainer } from "../container/registerDependencies.js";
import { type ApiOptions, ApiOptionsProvider } from "../config/apiOptions.js";

export const API_KEY_HEADER = "x-api-key";
export type ApiRole = ApiOptions["api_consumers"][number]["roles"][number];

export type ApiConsumer = ApiKeyPrincipal<ApiRole>;

let apiOptionsMonitor: OptionsMonitor<ApiOptions> | null = null;

function getApiOptionsMonitor(): OptionsMonitor<ApiOptions> {
  if (apiOptionsMonitor) {
    return apiOptionsMonitor;
  }

  apiOptionsMonitor = appContainer.resolve<OptionsMonitor<ApiOptions>>(
    getOptionsMonitorToken(ApiOptionsProvider)
  );

  return apiOptionsMonitor;
}

function getApiOptions(): ApiOptions {
  return getApiOptionsMonitor().currentValue;
}

function getConfiguredConsumers(apiOptions: ApiOptions): ApiConsumer[] {
  if (apiOptions.api_consumers.length > 0) {
    return apiOptions.api_consumers.map((consumer) => ({
      name: consumer.name,
      apiKey: consumer.api_key,
      roles: consumer.roles
    }));
  }

  // Backward-compatible fallback for older config that only has api_key.
  return [
    {
      name: "default-consumer",
      apiKey: apiOptions.api_key,
      roles: ["reader"]
    }
  ];
}

export function getApiConsumerFromRequest(request: FastifyRequest): ApiConsumer | null {
  const provided = request.headers[API_KEY_HEADER];
  if (!provided || typeof provided !== "string") {
    return null;
  }

  const apiOptions = getApiOptions();
  const consumers = getConfiguredConsumers(apiOptions);
  return findApiKeyPrincipal(consumers, provided);
}

function sendUnauthorized(reply: FastifyReply) {
  return reply.status(401).send({
    message: "Unauthorized",
    detail: `Missing or invalid '${API_KEY_HEADER}' header`,
  });
}

function sendForbidden(reply: FastifyReply, requiredRoles: readonly ApiRole[]) {
  return reply.status(403).send({
    message: "Forbidden",
    detail: `API key is valid but missing required role(s): ${requiredRoles.join(", ")}`,
  });
}

export function requireApiKeyAndRoles(requiredRoles: readonly ApiRole[] = []): preHandlerHookHandler {
  return (request, reply, done) => {
    const consumer = getApiConsumerFromRequest(request);

    if (!consumer) {
      return sendUnauthorized(reply);
    }

    if (requiredRoles.length > 0) {
      const missingRoles = getMissingRoles(consumer.roles, requiredRoles);
      if (missingRoles.length > 0) {
        return sendForbidden(reply, requiredRoles);
      }
    }

    done();
  };
}

/**
 * Fastify preHandler that validates the X-Api-Key header against configured API consumers.
 *
 * Usage in a route:
 *   { preHandler: [apiKeyGuard], schema: { security: [{ apiKey: [] }], ... } }
 */
export const apiKeyGuard: preHandlerHookHandler = requireApiKeyAndRoles();

