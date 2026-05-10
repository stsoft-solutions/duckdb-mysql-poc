import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { appContainer } from "../container/registerDependencies.js";
import { authRateLimitGuard } from "../hooks/rateLimit.js";
import { requireApiKeyAndRoles } from "../hooks/apiKeyGuard.js";
import {
  sqlQueryErrorJsonSchema,
  sqlQueryRequestJsonSchema,
  sqlQueryRequestSchema,
  sqlQuerySuccessJsonSchema,
} from "../schemas/sqlSchema.js";
import { SqlQueryService, SqlQueryTimeoutError, SqlRewriteError } from "../services/sqlQueryService.js";

export async function sqlRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/v1/sql/query",
    {
      preHandler: [authRateLimitGuard, requireApiKeyAndRoles(["reader"])],
      schema: {
        tags: ["SQL"],
        summary: "Execute read-only SQL through DuckDB",
        description:
          "Executes read-only SQL via DuckDB. Configured tables are resolved through pre-built federated views that union hot MySQL data and cold parquet files.",
        security: [{ apiKey: [] }],
        body: sqlQueryRequestJsonSchema,
        response: {
          200: {
            description: "SQL query executed successfully",
            ...sqlQuerySuccessJsonSchema,
          },
          400: {
            description: "Invalid SQL statement",
            ...sqlQueryErrorJsonSchema,
          },
          504: {
            description: "SQL query timed out",
            ...sqlQueryErrorJsonSchema,
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const body = sqlQueryRequestSchema.parse(request.body);
      const sqlQueryService = appContainer.resolve(SqlQueryService);

      try {
        return await sqlQueryService.execute(body.sql);
      } catch (error) {
        if (error instanceof SqlRewriteError) {
          return reply.status(400).send({
            code: "INVALID_SQL",
            message: "SQL statement is not accepted",
            detail: error.message,
          });
        }

        if (error instanceof SqlQueryTimeoutError) {
          return reply.status(504).send({
            code: "QUERY_TIMEOUT",
            message: "SQL execution timed out",
            detail: error.message,
          });
        }

        throw error;
      }
    },
  );
}

