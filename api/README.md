# API Service

<!-- TOC -->
* [API Service](#api-service)
  * [Endpoints](#endpoints)
    * [Example: Shared Infrastructure Usage](#example-shared-infrastructure-usage)
    * [Example: API Key + Role Security](#example-api-key--role-security)
  * [REST API organization best practices](#rest-api-organization-best-practices)
    * [Recommended API module pattern](#recommended-api-module-pattern)
    * [Versioning and endpoint design](#versioning-and-endpoint-design)
    * [Operational practices](#operational-practices)
    * [Testing best practices](#testing-best-practices)
    * [Pagination best practices](#pagination-best-practices)
    * [Error format best practices](#error-format-best-practices)
    * [Observability best practices](#observability-best-practices)
    * [API naming/versioning rules with examples](#api-namingversioning-rules-with-examples)
    * [Security checklist (authn/authz, hardening, rate limiting)](#security-checklist-authnauthz-hardening-rate-limiting)
    * [Copy-paste module scaffold/template](#copy-paste-module-scaffoldtemplate)
  * [Runtime dependencies used here](#runtime-dependencies-used-here)
  * [Configuration](#configuration)
    * [Main sections:](#main-sections)
    * [API configuration](#api-configuration)
    * [Logger configuration](#logger-configuration)
  * [Development](#development)
  * [Typecheck](#typecheck)
  * [Build and start](#build-and-start)
<!-- TOC -->

Fastify API service with Zod validation and `tsyringe` dependency injection.

## Endpoints

- `GET /v1/health` - health check
- `POST /v1/echo` - validate and echo request body
- `GET /v1/example/config` - example: shared infrastructure usage
- `GET /v1/example/secured` - example: API key authentication *(requires `x-api-key` header)*
- `GET /v1/example/secured/profile` - example: API key + resolved roles
- `GET /v1/example/secured/analyst-insights` - example: API key + `analyst` role required
- `GET /v1/example/secured/admin-report` - example: API key + `admin` role required
- `POST /v1/example/secured/analyst-query` - example: API key + `analyst` role + JSON body
- `GET /docs` - Swagger UI

### Example: Shared Infrastructure Usage

The `GET /v1/example/config` endpoint demonstrates how to use shared infrastructure components in an API endpoint:

**Features:**
- Dependency injection with `@inject()` for `LoggerFactory` and `ApiOptions`
- Zod schemas with full OpenAPI documentation
- Query parameter validation
- Optional response fields based on query params
- Logging with the shared logger

**Query parameters:**
- `includeDetails` (optional, defaults to `false`) - include timestamp and environment in response

**Example requests:**

```bash
# Basic config info (no details)
curl http://localhost:3000/v1/example/config

# With details
curl "http://localhost:3000/v1/example/config?includeDetails=true"
```

---

### Example: API Key + Role Security

The secured example endpoints demonstrate API key authentication plus role-based authorization:

**Features:**
- Reusable `apiKeyGuard` preHandler hook in `src/hooks/apiKeyGuard.ts`
- Reusable `requireApiKeyAndRoles([...roles])` guard for role-protected routes
- API consumers loaded from `api.api_consumers` config (name, key, roles)
- Backward compatibility with `api.api_key` for older setup
- OpenAPI `securitySchemes` definition — shows 🔒 lock icon in Swagger UI
- 401 Unauthorized and 403 Forbidden responses documented in OpenAPI schema
- `security: [{ apiKey: [] }]` on the route schema

**Query parameters:**
- `filter` (optional) - case-insensitive name filter

**Example requests:**

```powershell
# 401 Unauthorized — no key
curl.exe http://localhost:3000/v1/example/secured

# 401 Unauthorized — wrong key
curl.exe -H "x-api-key: wrong" http://localhost:3000/v1/example/secured

# 200 OK — all resources
curl.exe -H "x-api-key: dev-reader-key" http://localhost:3000/v1/example/secured

# 200 OK — filtered
curl.exe -H "x-api-key: dev-reader-key" "http://localhost:3000/v1/example/secured?filter=alpha"

# 200 OK — returns consumer name + roles from key
curl.exe -H "x-api-key: dev-analyst-key" http://localhost:3000/v1/example/secured/profile

# 200 OK — analyst role allowed
curl.exe -H "x-api-key: dev-analyst-key" http://localhost:3000/v1/example/secured/analyst-insights

# 403 Forbidden — valid key but missing analyst role
curl.exe -H "x-api-key: dev-reader-key" http://localhost:3000/v1/example/secured/analyst-insights

# 403 Forbidden — valid key but missing admin role
curl.exe -H "x-api-key: dev-analyst-key" http://localhost:3000/v1/example/secured/admin-report

# 200 OK — admin role allowed
curl.exe -H "x-api-key: dev-admin-key" http://localhost:3000/v1/example/secured/admin-report

# 200 OK — secured POST with JSON body (analyst role)
curl.exe -X POST http://localhost:3000/v1/example/secured/analyst-query `
  -H "Content-Type: application/json" `
  -H "x-api-key: dev-analyst-key" `
  -d '{"symbols":["EURUSD","XAUUSD"],"windowDays":14,"includeRaw":true}'

# 403 Forbidden — valid key but missing analyst role
curl.exe -X POST http://localhost:3000/v1/example/secured/analyst-query `
  -H "Content-Type: application/json" `
  -H "x-api-key: dev-reader-key" `
  -d '{"symbols":["EURUSD"]}'
```

**Responses:**

```json5
// 200 OK
{
  "data": [
    { "id": 1, "name": "Alpha", "secret": "token-alpha-9f2a" }
  ],
  "meta": { "total": 1, "filter": "alpha" }
}
```

```json5
// 401 Unauthorized
{ "message": "Unauthorized", "detail": "Missing or invalid 'x-api-key' header" }
```

**Set your consumers and roles** in `config/local.json5`:

```json5
{
  api: {
    api_consumers: [
      {
        name: "consumer-a",
        api_key: "real-key-a",
        roles: ["reader"]
      },
      {
        name: "consumer-b",
        api_key: "real-key-b",
        roles: ["reader", "analyst", "admin"]
      }
    ]
  }
}
```

## REST API organization best practices

Use this structure to keep routes, validation, business logic, and infrastructure concerns separated:

- Keep route registration thin in `src/routes/*Routes.ts` (HTTP details only).
- Put request/response schemas in `src/schemas/*Schema.ts` and reuse them in route `schema` options.
- Put business logic in `src/services/*Service.ts` and call services from routes.
- Keep cross-cutting concerns in `src/hooks/*` (authentication, authorization, tracing, rate limits).
- Resolve dependencies through `src/container/registerDependencies.ts` instead of creating concrete objects inside handlers.
- Keep configuration in `config/*.json5` + typed options in `src/config/*`.

### Recommended API module pattern

For each feature/module, use a consistent set of files:

- `src/routes/<feature>Routes.ts` - endpoint definitions and status codes
- `src/schemas/<feature>Schema.ts` - Zod request/response contracts + OpenAPI metadata
- `src/services/<feature>Service.ts` - domain/business logic
- `src/hooks/<feature>*.ts` - reusable guards/interceptors if needed

### Versioning and endpoint design

- Keep version prefixing (`/v1/...`) and only introduce `/v2` for breaking changes.
- Use plural nouns for collections when possible and clear resource-oriented paths.
- Prefer query params for filtering/pagination and request body for complex write operations.
- Return consistent error payloads (for example `message`, `detail`, optional `code`).
- Document security at schema level (`security: [{ apiKey: [] }]`) for every protected route.

### Operational practices

- Validate both request payloads and (optionally) responses (`api.validate_responses`) in development.
- Add structured logging at route boundaries and in service operations; avoid logging secrets.
- Keep handlers idempotent where expected (especially `PUT`/`DELETE`) and enforce input constraints.
- Add integration tests per route for: happy path, validation failures, auth failures, and role checks.

### Testing best practices

- Keep fast unit tests for service logic (`src/services/*`) and isolate external dependencies with mocks/fakes.
- Add integration tests for each route covering: `2xx`, validation errors (`400`), unauthorized (`401`), forbidden (`403`), and not found (`404`).
- Add contract checks for request/response schemas so OpenAPI and runtime behavior do not drift.
- Include negative tests for boundary values (empty lists, max lengths, invalid enums, large payloads).
- Treat security rules as testable behavior (role matrix tests for each protected endpoint).

### Pagination best practices

Use cursor pagination for high-volume or append-only datasets, and offset pagination for simple admin/report endpoints.

- Recommended query params: `limit` (default and max), plus either `cursor` or `offset`.
- Always return pagination metadata and stable sorting keys.
- Enforce a maximum `limit` in schema validation to prevent abusive queries.

Example (cursor-based):

```http
GET /v1/orders?limit=100&cursor=eyJpZCI6MTIzfQ==
```

```json
{
  "data": [{ "id": 124, "symbol": "EURUSD" }],
  "meta": {
    "limit": 100,
    "next_cursor": "eyJpZCI6MTI0fQ==",
    "has_more": true
  }
}
```

### Error format best practices

Standardize one error envelope across all endpoints:

```json
{
  "error": {
    "code": "AUTH_FORBIDDEN",
    "message": "Forbidden",
    "detail": "Missing required role: analyst",
    "request_id": "9f4c6d9f6b1f"
  }
}
```

- Keep `message` human-readable and short; put debug detail in `detail`.
- Keep `code` stable for clients and dashboards even if message text changes.
- Include `request_id` so logs and traces can be correlated quickly.
- Map validation failures to `400`, authentication to `401`, authorization to `403`, and unexpected errors to `500`.

### Observability best practices

- Generate or propagate `request_id` (for example from `x-request-id`) on every request.
- Log structured fields at minimum: `request_id`, `route`, `method`, `status_code`, `duration_ms`, and `consumer` (if authenticated).
- Capture metrics per route: request count, error count, and latency histogram (`p50`, `p95`, `p99`).
- Add distributed tracing for critical paths (DB, downstream HTTP, queue operations).
- Redact sensitive fields (`x-api-key`, tokens, secrets, PII) from logs and traces.

### API naming/versioning rules with examples

- Use nouns for resources, not verbs in paths.
- Use plural collections and resource identifiers in path segments.
- Keep query keys consistent (`filter`, `sort`, `limit`, `cursor`) across endpoints.
- Introduce a new major version only for breaking changes; keep non-breaking additions in the same version.

Examples:

- Good: `GET /v1/orders`
- Good: `GET /v1/orders/{orderId}`
- Good: `POST /v1/orders/{orderId}/cancel`
- Avoid: `GET /v1/getOrders`
- Avoid: `POST /v1/order/create`

Versioning example:

- `GET /v1/orders` -> existing response contract
- `GET /v2/orders` -> breaking field rename or semantic change

### Security checklist (authn/authz, hardening, rate limiting)

- Authentication: require `x-api-key` (or stronger auth) on protected endpoints; reject missing/invalid credentials with `401`.
- Authorization: enforce role checks with reusable guards (for example `requireApiKeyAndRoles([...])`); return `403` on insufficient roles.
- Input hardening: validate all params/body with Zod, reject unknown fields when appropriate, and cap payload sizes.
- Output hardening: avoid returning internal stack traces, secrets, or implementation-specific DB errors.
- Transport: run behind TLS in non-local environments and avoid plaintext credentials.
- Rate limiting: apply per-consumer and per-IP quotas on sensitive routes and authentication endpoints.
- Abuse protection: add request timeouts, concurrency limits, and payload limits.
- Auditability: log authn/authz decisions with `request_id` and principal/consumer identity.

### Copy-paste module scaffold/template

Use this template when adding a new feature module (replace `<feature>` with your domain name):

```text
src/
  routes/
    <feature>Routes.ts
  schemas/
    <feature>Schema.ts
  services/
    <feature>Service.ts
```

`src/schemas/<feature>Schema.ts`

```ts
import { z } from "zod";

export const listFeatureQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export const featureItemSchema = z.object({
  id: z.number().int(),
  name: z.string(),
});

export const listFeatureResponseSchema = z.object({
  data: z.array(featureItemSchema),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});
```

`src/services/<feature>Service.ts`

```ts
import { injectable } from "tsyringe";

@injectable()
export class FeatureService {
  async list(input: { limit: number; cursor?: string }) {
    return {
      data: [{ id: 1, name: "sample" }],
      meta: {
        limit: input.limit,
        next_cursor: null,
        has_more: false,
      },
    };
  }
}
```

`src/routes/<feature>Routes.ts`

```ts
import type { FastifyPluginAsync } from "fastify";
import { container } from "tsyringe";
import {
  listFeatureQuerySchema,
  listFeatureResponseSchema,
} from "../schemas/<feature>Schema";
import { FeatureService } from "../services/<feature>Service";

export const featureRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/<features>", {
    schema: {
      tags: ["<feature>"],
      querystring: listFeatureQuerySchema,
      response: { 200: listFeatureResponseSchema },
      security: [{ apiKey: [] }],
    },
  }, async (request) => {
    const query = listFeatureQuerySchema.parse(request.query);
    const service = container.resolve(FeatureService);
    return service.list(query);
  });
};
```

## Runtime dependencies used here

- `@duckdb-poc/shared-infra` for shared logger/config primitives
- `tsyringe` for DI container and decorators in API code

## Configuration

The API loads configuration from `config/default.json5` and optional `config/local.json5`.

### Main sections:

- `logger` - logging setup (level, service name, formatting, max listeners)
- `api` - API server settings (host, port, optional response validation)

### API configuration

Key options:
- `host` - bind host (for example `127.0.0.1`)
- `port` - listen port (for example `3000`)
- `validate_responses` - when `true`, validates outgoing JSON responses against each route's `schema.response` JSON Schema (recommended for development; defaults to `false`)

### Logger configuration

Key options:
- `level` - log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`)
- `pretty` - enable pretty formatting via `pino-pretty`
- `max_listeners` - sets `EventEmitter.defaultMaxListeners` globally — covers HTTP sockets, streams, and all EventEmitters (default 100)
- `pretty_options` - colorize, line formatting, field hiding options

Example:

```json5
{
  logger: {
    level: "info",
    service_name: "api",
    pretty: true,
    max_listeners: 100,  // Handles ~100 concurrent socket connections
    pretty_options: {
      colorize: true,
      single_line: true,
      hide_object: true
    }
  },
  api: {
    host: "127.0.0.1",
    port: 3000
  }
}
```

For more logger options, see `/shared-infra/README.md`.

## Development

```powershell
npm install
npm run dev
```

## Typecheck

```powershell
npm run typecheck
```

## Build and start

```powershell
npm run build
npm start
```

