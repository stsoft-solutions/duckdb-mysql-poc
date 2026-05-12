# duckdb-mysql-poc

Proof-of-concept workspace for exporting MySQL data to parquet with DuckDB tooling, then querying MySQL and parquet-backed data through a Fastify API.

Last updated: 2026-05-12

## Last Updates

- API includes a secured `POST /v1/sql/query` endpoint for read-only SQL execution through DuckDB.
- API key consumers and role checks are configured through `api.api_consumers`; sample keys live in `api/config/default.json5`.
- API rate limiting is enabled for authenticated and sensitive endpoints.
- Exporter output and API parquet lookup paths now use `local_storage/data` by default.
- Project-specific documentation lives in `api/README.md`, `exporter/README.md`, and `shared-infra/README.md`.

## Projects

- `shared-infra` - shared config, logging, security helpers, and DB pool infrastructure
- `exporter` - CLI exporter for MySQL to parquet files
- `api` - Fastify REST API with secured examples, Swagger UI, and SQL query endpoint
- `docker` - local MySQL stack and init scripts
- `local_storage` - generated local parquet data and temporary files

## Prerequisites

- Node.js 20+
- npm
- Docker Desktop or compatible Docker engine

## Start Local Database

```powershell
docker compose -f docker/docker-compose.yml up --detach --remove-orphans
```

Stop and remove volumes:

```powershell
docker compose -f docker/docker-compose.yml down --volumes
```

## Run Exporter

The exporter configuration lives in `exporter/config/default.json5` with these top-level sections:

- `logger`
- `database`
- `export_service`
- `settings`

Use `exporter/config/local.json5` for local-only overrides such as the MySQL attachment password under `database.connections.processing.attachments[0].password`.

Final parquet files are written to `local_storage/data` by default, with temporary files under `local_storage/temp`.

```powershell
Set-Location .\exporter
npm install
npm run start
```

## Run API

The API configuration lives in `api/config/default.json5` with these top-level sections:

- `logger`
- `api`
- `database`
- `sql_query`

Use `api/config/local.json5` for local-only overrides such as real API keys, MySQL credentials, SQL timeout, or federated table configuration.

```powershell
Set-Location .\api
npm install
npm run dev
```

Swagger UI is available at `http://127.0.0.1:3000/docs`.

### SQL Query Endpoint

`POST /v1/sql/query` accepts read-only SQL and requires a consumer with the `reader` role.

```powershell
curl.exe -X POST http://127.0.0.1:3000/v1/sql/query `
  -H "Content-Type: application/json" `
  -H "x-api-key: dev-reader-key" `
  -d '{"sql":"select 1 as value"}'
```

Configure federated MySQL/parquet tables under `api/config/default.json5` or `api/config/local.json5` in the `sql_query.tables` array.

## Build Shared Infrastructure

```powershell
Set-Location .\shared-infra
npm install
npm run build
```

## Useful Checks

```powershell
Set-Location .\api
npm run typecheck
npm test
```

```powershell
Set-Location .\shared-infra
npm run typecheck
npm test
```
