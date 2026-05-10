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
- `database` - connection pools and initialisation
- `export_service` - export parameters (chunk size, paths, etc.)
- `settings` - export range and table definitions

Each provider reads a **top-level** config section matching its `SectionName`.
For the exporter, `database`, `export_service`, and `settings` are sibling sections in `config/default.json5` and `config/local.json5`.
Do **not** nest `export_service` or `settings` inside `database`.

### Exporter configuration shape

Minimal example:

```json5
{
  logger: {
    level: "info",
    pretty: true
  },
  database: {
    default_timeout: 30000,
    connections: {
      processing: {
        kind: "duckdb",
        storage: {
          mode: "memory"
        },
        extensions: ["mysql"],
        attachments: [
          {
            type: "mysql",
            alias: "mysql_db",
            read_only: true,
            host: "localhost",
            port: 3306,
            username: "bugaga",
            password: "<set in local.json5>",
            database: "stat_ms"
          }
        ]
      }
    }
  },
  export_service: {
    chunk_size: 250000,
    db_connection: "processing",
    attached_db_alias: "mysql_db",
    storage_path: "../local_storage/export",
    temp_path: "../local_storage/temp"
  },
  settings: {
    from: {
      year: 2020,
      month: 1
    },
    to: {
      year: 2025,
      month: 12
    },
    schema_name: "mysql_db",
    tables: [
      {
        table: "order_mt4",
        field: "time",
        time_representation: "datetime"
      }
    ]
  }
}
```

Typical local secret override:

```json5
{
  database: {
    connections: {
      processing: {
        attachments: [
          {
            password: "<real-password>"
          }
        ]
      }
    }
  }
}
```

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
  LoggerFactory,
  LoggerOptionsProvider,
  registerDbPool,
  registerLogging
} from "@duckdb-poc/shared-infra";
import { AppOptionsProvider } from "./src/app/AppOptions.js";
import { ExportServiceOptionsProvider } from "./src/services/exportServiceOptions.js";

registerLogging(container);

const configurationManager = new ConfigurationManager(container);
configurationManager.addOptionsMany([
  LoggerOptionsProvider,
  DbPoolManagerOptionsProvider,
  ExportServiceOptionsProvider,
  AppOptionsProvider
]);

registerDbPool(container);

const logger = container.resolve(LoggerFactory).create("main");
logger.info("Exporter bootstrap complete");
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
- If configuration hydration reports unknown keys for `database`, check that `export_service` and `settings` were not nested under it.
