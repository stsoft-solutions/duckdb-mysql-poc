# API Service

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

