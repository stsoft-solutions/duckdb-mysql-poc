# duckdb-mysql-poc

Proof-of-concept workspace for exporting MySQL data to parquet with DuckDB tooling.

## Projects

- `shared-infra` - shared config, logging, and DB pool infrastructure
- `exporter` - CLI exporter (MySQL -> parquet files)
- `api` - Fastify REST API sample
- `docker` - local MySQL stack and init scripts

## Prerequisites

- Node.js 20+
- npm
- Docker Desktop (or compatible Docker engine)

## Start local database

```powershell
docker compose -f docker/docker-compose.yml up --detach --remove-orphans
```

Stop and remove volumes:

```powershell
docker compose -f docker/docker-compose.yml down --volumes
```

## Run exporter

```powershell
Set-Location .\exporter
npm install
npm run start
```

## Run API

```powershell
Set-Location .\api
npm install
npm run dev
```

## Build shared infrastructure package

```powershell
Set-Location .\shared-infra
npm install
npm run build
```

