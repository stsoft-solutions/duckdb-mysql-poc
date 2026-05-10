# API Service

Initial REST API service using:

- Fastify
- TypeScript
- Zod (runtime DTO validation)
- tsyringe (dependency injection)
- OpenAPI/Swagger (`@fastify/swagger` + `@fastify/swagger-ui`)

## Endpoints

- `GET /v1/health` - health check
- `POST /v1/echo` - echo message payload with validation
- `GET /docs` - Swagger UI

## Environment variables

- `HOST` (default: `0.0.0.0`)
- `PORT` (default: `3000`)
- `LOG_LEVEL` (default: `info`)

## Run locally

```bash
npm install
npm run dev
```

## Build and run

```bash
npm run build
npm start
```

