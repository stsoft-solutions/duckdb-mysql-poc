# duckdb-mysql-poc

Proof-of-concept workspace for exporting MySQL data to parquet with DuckDB tooling, then querying MySQL and parquet-backed data through a Fastify API.

Last updated: 2026-05-13

## Last Updates

- API includes a secured `POST /v1/sql/query` endpoint for read-only SQL execution through DuckDB.
- SQL query table rewriting now preserves configured federated views and CTE names while qualifying regular MySQL tables, including nested `FROM` clauses and already-qualified table names.
- Federated SQL views support hot/cold splits based on the maximum timestamp found in parquet files.
- Federated table config supports `table_override` when the DuckDB view name should differ from the live MySQL table name.
- Timestamp field type names are now `datetime`, `epoch`, and `epoch_ms` across exporter and API SQL configuration.
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

### API Authentication and Authorization Test Endpoints

The API uses the `x-api-key` header for API key authentication. Consumers and roles are configured in `api/config/default.json5` under `api.api_consumers` and can be overridden in `api/config/local.json5`.

Default development consumers:

| Consumer         | API key           | Roles                        |
|------------------|-------------------|------------------------------|
| `reader-client`  | `dev-reader-key`  | `reader`                     |
| `analyst-client` | `dev-analyst-key` | `reader`, `analyst`          |
| `admin-client`   | `dev-admin-key`   | `reader`, `analyst`, `admin` |

Use these endpoints to test authentication, authorization, and consumer role behavior:

| Endpoint                                       | Required access   | What it tests                                                       |
|------------------------------------------------|-------------------|---------------------------------------------------------------------|
| `GET /v1/example/secured`                      | Any valid API key | Basic API key authentication and secured resource access            |
| `GET /v1/example/secured/profile`              | Any valid API key | Resolves the authenticated consumer name and roles from the API key |
| `GET /v1/example/secured/analyst-insights`     | `analyst` role    | Role-based authorization for analyst consumers                      |
| `POST /v1/example/secured/analyst-query`       | `analyst` role    | Role-based authorization plus JSON body validation                  |
| `GET /v1/example/secured/admin-report`         | `admin` role      | Role-based authorization for admin consumers                        |
| `POST /v1/example/secured/admin/reload-config` | `admin` role      | Admin-only action that reloads configuration                        |
| `POST /v1/sql/query`                           | `reader` role     | Real secured API consumer endpoint for read-only SQL execution      |

Expected authorization behavior:

- Missing or invalid `x-api-key` returns `401 Unauthorized`.
- A valid API key without the required role returns `403 Forbidden`.
- Repeated calls to protected endpoints can return `429 Too Many Requests` when the configured per-IP or per-consumer rate limit is exceeded.

Example authentication and authorization checks:

```powershell
# 401 Unauthorized - no API key
curl.exe http://127.0.0.1:3000/v1/example/secured

# 401 Unauthorized - invalid API key
curl.exe -H "x-api-key: wrong" http://127.0.0.1:3000/v1/example/secured

# 200 OK - any valid consumer can access the secured example
curl.exe -H "x-api-key: dev-reader-key" http://127.0.0.1:3000/v1/example/secured

# 200 OK - inspect the authenticated consumer and roles
curl.exe -H "x-api-key: dev-analyst-key" http://127.0.0.1:3000/v1/example/secured/profile

# 403 Forbidden - reader lacks the analyst role
curl.exe -H "x-api-key: dev-reader-key" http://127.0.0.1:3000/v1/example/secured/analyst-insights

# 200 OK - analyst role is allowed
curl.exe -H "x-api-key: dev-analyst-key" http://127.0.0.1:3000/v1/example/secured/analyst-insights

# 403 Forbidden - analyst lacks the admin role
curl.exe -H "x-api-key: dev-analyst-key" http://127.0.0.1:3000/v1/example/secured/admin-report

# 200 OK - admin role is allowed
curl.exe -H "x-api-key: dev-admin-key" http://127.0.0.1:3000/v1/example/secured/admin-report

# 200 OK - analyst-only secured POST
curl.exe -X POST http://127.0.0.1:3000/v1/example/secured/analyst-query `
  -H "Content-Type: application/json" `
  -H "x-api-key: dev-analyst-key" `
  -d '{"symbols":["EURUSD","XAUUSD"],"windowDays":14,"includeRaw":true}'

# 200 OK - admin-only config reload
curl.exe -X POST http://127.0.0.1:3000/v1/example/secured/admin/reload-config `
  -H "x-api-key: dev-admin-key"
```

### SQL Query Endpoint

`POST /v1/sql/query` accepts read-only SQL and requires a consumer with the `reader` role.

```powershell
curl.exe -X POST http://127.0.0.1:3000/v1/sql/query `
  -H "Content-Type: application/json" `
  -H "x-api-key: dev-reader-key" `
  -d '{"sql":"select 1 as value"}'
```

Configure federated MySQL/parquet tables under `api/config/default.json5` or `api/config/local.json5` in the `sql_query.tables` array. Each entry creates a DuckDB view that reads cold parquet rows from `parquet_root`, live rows from the MySQL attachment, and adds a `ds` column (`p` for parquet, `d` for database).

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
