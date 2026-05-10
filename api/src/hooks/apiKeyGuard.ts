import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { appContainer } from "../container/registerDependencies.js";
import { ApiOptionsProvider, type ApiOptions } from "../config/apiOptions.js";
import type { Options } from "@duckdb-poc/shared-infra";

export const API_KEY_HEADER = "x-api-key";
export type ApiRole = ApiOptions["api_consumers"][number]["roles"][number];

type ApiConsumer = ApiOptions["api_consumers"][number];

function getApiOptions(): ApiOptions {
  return appContainer
    .resolve<Options<ApiOptions>>(ApiOptionsProvider.OptionsToken)
    .value;
}

function getConfiguredConsumers(apiOptions: ApiOptions): ApiConsumer[] {
  if (apiOptions.api_consumers.length > 0) {
    return apiOptions.api_consumers;
  }

  // Backward-compatible fallback for older config that only has api_key.
  return [
    {
      name: "default-consumer",
      api_key: apiOptions.api_key,
      roles: ["reader"],
    },
  ];
}

export function getApiConsumerFromRequest(request: FastifyRequest): ApiConsumer | null {
  const provided = request.headers[API_KEY_HEADER];
  if (!provided || typeof provided !== "string") {
    return null;
  }

  const apiOptions = getApiOptions();
  const consumers = getConfiguredConsumers(apiOptions);
  return consumers.find((consumer) => consumer.api_key === provided) ?? null;
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
      const missingRoles = requiredRoles.filter((role) => !consumer.roles.includes(role));
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

