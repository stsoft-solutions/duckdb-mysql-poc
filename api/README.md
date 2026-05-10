# API Service

Fastify API service with Zod validation and `tsyringe` dependency injection.

## Endpoints

- `GET /v1/health` - health check
- `POST /v1/echo` - validate and echo request body
- `GET /docs` - Swagger UI

## Runtime dependencies used here

- `@duckdb-poc/shared-infra` for shared logger/config primitives
- `tsyringe` for DI container and decorators in API code

## Configuration

The API loads configuration from `config/default.json5` and optional `config/local.json5`.

Main sections:

- `logger`
- `api`

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

