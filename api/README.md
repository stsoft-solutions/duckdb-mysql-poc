# API Service

Fastify API service with Zod validation and `tsyringe` dependency injection.

## Endpoints

- `GET /v1/health` - health check
- `POST /v1/echo` - validate and echo request body
- `GET /v1/example/config` - example: shared infrastructure usage
- `GET /v1/example/secured` - example: API key authentication *(requires `x-api-key` header)*
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

### Example: API Key Security

The `GET /v1/example/secured` endpoint demonstrates API key authentication via `x-api-key` header:

**Features:**
- Reusable `apiKeyGuard` preHandler hook in `src/hooks/apiKeyGuard.ts`
- API key loaded from `api.api_key` config (never hardcoded)
- OpenAPI `securitySchemes` definition — shows 🔒 lock icon in Swagger UI
- 401 Unauthorized response documented in OpenAPI schema
- `security: [{ apiKey: [] }]` on the route schema

**Query parameters:**
- `filter` (optional) - case-insensitive name filter

**Example requests:**

```bash
# 401 Unauthorized — no key
curl http://localhost:3000/v1/example/secured

# 401 Unauthorized — wrong key
curl -H "x-api-key: wrong" http://localhost:3000/v1/example/secured

# 200 OK — all resources
curl -H "x-api-key: dev-secret-key" http://localhost:3000/v1/example/secured

# 200 OK — filtered
curl -H "x-api-key: dev-secret-key" "http://localhost:3000/v1/example/secured?filter=alpha"
```

**Responses:**

```json
// 200 OK
{
  "data": [
    { "id": 1, "name": "Alpha", "secret": "token-alpha-9f2a" }
  ],
  "meta": { "total": 1, "filter": "alpha" }
}

// 401 Unauthorized
{ "message": "Unauthorized", "detail": "Missing or invalid 'x-api-key' header" }
```

**Set your API key** in `config/local.json5`:

```json5
{
  api: {
    api_key: "your-real-secret-key"
  }
}
```

## Runtime dependencies used here

- `@duckdb-poc/shared-infra` for shared logger/config primitives
- `tsyringe` for DI container and decorators in API code

## Configuration

The API loads configuration from `config/default.json5` and optional `config/local.json5`.

### Main sections:

- `logger` - logging setup (level, service name, formatting, max listeners)
- `api` - API server settings (host, port)

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

