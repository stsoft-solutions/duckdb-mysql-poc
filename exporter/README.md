# Exporter

CLI application that exports monthly data from MySQL tables into parquet files.

## What it does

- Reads source data from MySQL via DuckDB attachments
- Exports data by month in chunked parquet files
- Consolidates chunk files into final monthly parquet outputs
- Uses `../local_storage/temp` for intermediate chunks
- Writes final output to `../local_storage/export`

## Runtime stack

- `tsyringe` for DI in exporter app code
- `@duckdb-poc/shared-infra` for logging, config, and DB pool abstractions
- `@duckdb/node-api` for DuckDB access

## Configuration

The exporter loads configuration from `config/default.json5` and optional `config/local.json5`.

Main sections:

- `logger` - logging setup (level, formatting, max listeners)
- `database` - connection pools and initialization
- `export_service` - export parameters (chunk size, paths, etc.)

### Logger configuration

Key options:
- `level` - log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`)
- `pretty` - enable pretty formatting via `pino-pretty`
- `max_listeners` - sets `EventEmitter.defaultMaxListeners` globally — covers all sockets and streams (default 100)
- `pretty_options` - colorize, line formatting, field hiding options

For more logger options, see `/shared-infra/README.md`.

## Run in development

```powershell
npm install
npm run dev
```

## Build and run

```powershell
npm run build
npm run start
```

## DI bootstrap pattern used by exporter

```ts
import "reflect-metadata";
import { container } from "tsyringe";
import {
  ConfigurationManager,
  DbPoolManagerOptionsProvider,
  LoggerOptionsProvider,
  registerDbPool,
  registerLogging
} from "@duckdb-poc/shared-infra";

const configurationManager = new ConfigurationManager(container);
configurationManager.addOptionsMany([
  LoggerOptionsProvider,
  DbPoolManagerOptionsProvider
]);

registerLogging(container);
registerDbPool(container);
```

## Output layout

Final parquet files are written under:

```text
../local_storage/export/<table>/year=<YYYY>/month=<M>/
```

Temporary chunk files are written under:

```text
../local_storage/temp/<table>/<YYYY>/<M>/
```

## Notes

- Import `inject` and `injectable` from `tsyringe` in exporter services.
- Keep `shared-infra` imports focused on infra types/services and registration helpers.
