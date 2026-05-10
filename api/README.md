# API Service

Fastify API service with Zod validation and `tsyringe` dependency injection.

## Endpoints

- `GET /v1/health` - health check
- `POST /v1/echo` - validate and echo request body
- `GET /v1/example/config` - example endpoint demonstrating shared infrastructure usage
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

**Example response with details:**

```json
{
  "service": "API",
  "host": "127.0.0.1",
  "port": 3000,
  "details": {
    "timestamp": "2026-05-10T07:41:54.224Z",
    "environment": "development"
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
- `max_listeners` - Node.js EventEmitter threshold (default 50, increase for high concurrency)
- `pretty_options` - colorize, line formatting, field hiding options

Example:

```json5
{
  logger: {
    level: "info",
    service_name: "api",
    pretty: true,
    max_listeners: 50,  // Increase if handling many concurrent requests
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

