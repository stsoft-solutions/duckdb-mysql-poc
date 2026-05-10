import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { appContainer } from "../container/registerDependencies.js";
import { ApiOptionsProvider, type ApiOptions } from "../config/apiOptions.js";
import type { Options } from "@duckdb-poc/shared-infra";

export const API_KEY_HEADER = "x-api-key";

/**
 * Fastify preHandler that validates the X-Api-Key header against the configured api_key.
 *
 * Usage in a route:
 *   { preHandler: [apiKeyGuard], schema: { security: [{ apiKey: [] }], ... } }
 */
export const apiKeyGuard: preHandlerHookHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
  done
) => {
  const apiOptions = appContainer
    .resolve<Options<ApiOptions>>(ApiOptionsProvider.OptionsToken)
    .value;

  const provided = request.headers[API_KEY_HEADER];

  if (!provided || provided !== apiOptions.api_key) {
    return reply.status(401).send({
      message: "Unauthorized",
      detail: `Missing or invalid '${API_KEY_HEADER}' header`,
    });
  }

  done();
};

