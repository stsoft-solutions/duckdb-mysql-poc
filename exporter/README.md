# Exporter

CLI application that exports monthly data from MySQL tables into parquet files.

## What it does

- Reads source data from MySQL via DuckDB attachments
- Exports data by month in chunked parquet files
- Consolidates chunk files into final monthly parquet outputs
- Uses cursor-style timestamp ranges and pushdown-friendly epoch boundaries for large source tables
- Skips the chunk upper-bound lookup when a month fits in a single configured chunk
- Uses `../local_storage/temp` for intermediate chunks
- Writes final output to `../local_storage/data`

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

### `export_service` section

Controls how the export runs:

| Key                 | Type     | Description                                                                             |
|---------------------|----------|-----------------------------------------------------------------------------------------|
| `chunk_size`        | `number` | Number of rows written per intermediate chunk parquet file.                             |
| `db_connection`     | `string` | Name of the DuckDB connection (from `database.connections`) to use for queries.         |
| `attached_db_alias` | `string` | Alias of the attached MySQL database as defined in the connection's `attachments`.      |
| `storage_path`      | `string` | Relative or absolute path where final monthly parquet files are written.                |
| `temp_path`         | `string` | Relative or absolute path for intermediate chunk files. Chunks are merged then deleted. |

### `settings` section

Controls the export scope — which tables to export and over what time range:

| Key           | Type     | Description                                                              |
|---------------|----------|--------------------------------------------------------------------------|
| `from.year`   | `number` | Start year (inclusive) of the export range.                              |
| `from.month`  | `number` | Start month (1–12, inclusive) of the export range.                       |
| `to.year`     | `number` | End year (inclusive) of the export range.                                |
| `to.month`    | `number` | End month (1–12, inclusive) of the export range.                         |
| `schema_name` | `string` | Schema (attached DB alias) used to qualify table names in generated SQL. |
| `tables`      | `array`  | List of table descriptors to export (see below).                         |

Each entry in `tables` has the following shape:

| Key                   | Type     | Description                                                                                                                                              |
|-----------------------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| `table`               | `string` | Table name inside the attached MySQL database.                                                                                                           |
| `field`               | `string` | Name of the timestamp/date column used to partition data by month.                                                                                       |
| `time_representation` | `string` | How the time column is stored: `"datetime"` (MySQL `DATETIME`), `"epoch"` (Unix timestamp in seconds), or `"epoch_ms"` (Unix timestamp in milliseconds). |

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
    storage_path: "../local_storage/data",
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
    tables: []
  }
}
```

Typical local secret override (docker):

```json5
{
  database: {
    connections: {
      processing: {
        attachments: [
          {
            password: "bugaga"
          }
        ]
      }
    }
  },
  settings: {
    tables: [
      {
        table: "order_mt4",
        field: "time",
        time_representation: "datetime"
      },
      {
        table: "order_mt5",
        field: "time",
        time_representation: "epoch"
      },
      {
        table: "order_mt6",
        field: "time",
        time_representation: "datetime"
      }
    ]
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
../local_storage/data/<table>/year=<YYYY>/month=<M>/
```

Temporary chunk files are written under:

```text
../local_storage/temp/<table>/<YYYY>/<M>/
```

During consolidation, the exporter rebuilds the destination month folder, writes ordered ZSTD-compressed parquet output with a 1 GiB DuckDB file size target, and removes the temporary month folder after successful consolidation.

## Notes

- Import `inject` and `injectable` from `tsyringe` in exporter services.
- Keep `shared-infra` imports focused on infra types/services and registration helpers.
- If configuration hydration reports unknown keys for `database`, check that `export_service` and `settings` were not nested under it.
