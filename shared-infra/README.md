<!-- TOC -->
* [Shared Infrastructure](#shared-infrastructure)
  * [What this package provides](#what-this-package-provides)
  * [Components](#components)
    * [Configuration components](#configuration-components)
    * [Logging components](#logging-components)
    * [Database components](#database-components)
  * [Important DI note](#important-di-note)
  * [Options pattern — .NET analogy](#options-pattern--net-analogy)
  * [Runtime reload](#runtime-reload)
  * [Options description](#options-description)
    * [Logger options (`logger` section)](#logger-options-logger-section)
    * [Database options (`database` section)](#database-options-database-section)
      * [MySQL connection](#mysql-connection)
      * [MariaDB connection](#mariadb-connection)
      * [DuckDB connection](#duckdb-connection)
  * [Usage examples](#usage-examples)
    * [1) Bootstrap container, config, logging, and DB pool](#1-bootstrap-container-config-logging-and-db-pool)
    * [2) Define and register a custom options section](#2-define-and-register-a-custom-options-section)
    * [3) Inject shared infra services in an application service](#3-inject-shared-infra-services-in-an-application-service)
    * [4) Use async log context helpers](#4-use-async-log-context-helpers)
    * [5) React to config changes with OptionsMonitor](#5-react-to-config-changes-with-optionsmonitor)
    * [6) Use OptionsSnapshot for per-resolution freshness](#6-use-optionssnapshot-for-per-resolution-freshness)
  * [Build and test](#build-and-test)
<!-- TOC -->

# Shared Infrastructure

Reusable infrastructure components shared by `exporter` and `api`.

## What this package provides

This package groups infrastructure concerns that multiple applications can share:

- typed configuration loading and validation
- logger registration and component loggers
- database connection/pool registration
- shared abstractions used by application services

## Components

### Configuration components

- `Options<T>`
  - simple wrapper around a hydrated configuration object
  - lets services depend on `Options<MyOptions>` instead of raw unvalidated config
- `OptionsMonitor<T>`
  - exposes `currentValue` and `onChange(...)`
  - receives updates when `ConfigurationManager.reloadOptions(...)` or `reloadAllOptions()` is called
- `OptionsSnapshot<T>`
  - captures a monitor value at resolve time (useful for request/job scoped lifetimes)
- `OptionsTokenProvider<T>`
  - describes how a config section is loaded
  - defines the DI token, section name, optional defaults, hydration, and validation
  - can optionally override monitor/snapshot tokens via `MonitorToken` and `SnapshotToken`
- `ConfigurationManager`
  - reads config sections from `node-config`
  - applies defaults
  - hydrates raw JSON-like config into typed objects
  - registers the final `Options<T>` value into a `tsyringe` container
  - registers `OptionsMonitor<T>` and `OptionsSnapshot<T>` as well
  - can refresh monitor values at runtime via `reloadOptions(...)` or `reloadAllOptions()`

Every `OptionsTokenProvider.SectionName` maps to a **top-level** configuration section.
For example, if one provider reads `database` and another reads `export_service`, those sections must be sibling keys in the config file rather than nested inside each other.

### Logging components

- `LoggerOptions` / `LoggerOptionsProvider`
  - strongly typed logger configuration
- `registerLogging(container)`
  - registers logger services into a `tsyringe` container
- `LoggerFactory`
  - creates component-scoped loggers such as `main`, `ExportService`, or `HealthService`
- `AppLogger`
  - shared logging abstraction used by consumers
- `runWithLogContext` / `runWithChildLogContext`
  - propagate bindings like `requestId`, `runId`, or `jobId` through async flows

### Database components

- `DbPoolManagerOptionsProvider`
  - loads and validates the `database` configuration section
- `registerDbPool(container)`
  - registers `DbPoolManager` into a `tsyringe` container
- `DbPoolManager`
  - resolves named configured connections
  - creates and caches concrete database clients lazily
- `Database`
  - shared abstraction used by services that execute queries/statements

## Important DI note

This package does **not** export `container`, `inject`, or `injectable`.

Use `tsyringe` directly in each project:

- import `container` from `tsyringe` in app bootstrap
- import `inject` / `injectable` from `tsyringe` in app services
- use `shared-infra` for infra services, tokens, option providers, and registration helpers

## Options pattern — .NET analogy

The three configuration interfaces mirror the [.NET Options pattern](https://learn.microsoft.com/aspnet/core/fundamentals/configuration/options):

| Interface | .NET equivalent | Lifetime | Value |
|---|---|---|---|
| `Options<T>` | `IOptions<T>` | Singleton | Frozen at `addOptions()` call — never changes |
| `OptionsMonitor<T>` | `IOptionsMonitor<T>` | Singleton | `currentValue` always reflects the latest reload; supports `onChange(listener)` |
| `OptionsSnapshot<T>` | `IOptionsSnapshot<T>` | **Transient** (new per `resolve()`) | Captures monitor's `currentValue` at the moment it is resolved from the container |

Key difference from .NET: `IOptionsSnapshot<T>` in .NET is **scoped** (once per HTTP request scope).
Here it is **transient** — a fresh snapshot is captured on every `container.resolve(...)`.
In a Node.js service without explicit DI scopes this is the safer choice; a snapshot resolved
inside a request handler is always consistent for that handler.

## Runtime reload

Calling `reloadAllOptions()` or `reloadOptions(provider)`:

1. **Re-reads source files from disk** (`.json5` and `.json` only). The list of files is
   captured at startup from `node-config`'s resolved source list, so the `NODE_ENV` /
   `NODE_APP_INSTANCE` / hostname cascade is fully preserved — only the file _contents_ are
   refreshed, not the cascade rule itself.
2. Runs `hydrate` and `validate` again on the fresh raw values.
3. Pushes the new value into every affected `OptionsMonitor<T>`.
4. Fires all registered `onChange` listeners.

`Options<T>` is **never** touched by reload — it keeps the startup value forever.

`OptionsSnapshot<T>` does not need to be explicitly reloaded — the next
`container.resolve(snapshotToken)` call after a reload automatically captures the
monitor's new value.

> **What is NOT refreshed on reload**
> - Values supplied via the `NODE_CONFIG` environment variable (inline JSON string) — changing
>   an environment variable requires a process restart anyway.
> - JavaScript (`.js`) or YAML (`.yml` / `.yaml`) config files — those are skipped during the
>   disk re-read. If you have such files the cached startup values are used as a fallback.

## Options description

### Logger options (`logger` section)

`LoggerOptionsProvider` reads the `logger` section.

Supported fields:

- `level`
  - one of: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`
  - default: `info`
- `service_name`
  - logical service name written into logs
  - default: `service`
- `environment`
  - environment label written into logs
  - default: `NODE_ENV` or `development`
- `pretty`
  - when `true`, enables pretty console output via `pino-pretty`
  - default: `false`
- `max_listeners`
  - sets `EventEmitter.defaultMaxListeners` — the listener threshold for **every** EventEmitter in the process, including HTTP sockets, streams, and pino transports
  - set higher when handling many concurrent requests or connections to avoid spurious `MaxListenersExceededWarning`
  - default: `100`
  - minimum: `1`
- `pretty_options`
  - nested pretty-printer options

`pretty_options` fields:

- `colorize` - enable ANSI colors, default `true`
- `ignore` - comma-separated list of hidden fields, default `pid,hostname,service,environment,level,time`
- `single_line` - write prettified logs in a single line where possible, default `true`
- `hide_object` - suppress extra object payload in the main line, default `true`
- `hide_error_object` - when `hide_object` is enabled, suppress explicit error details too, default `false`

Example:

```json5
{
  logger: {
    level: "info",
    service_name: "exporter",
    environment: "development",
    pretty: true,
    max_listeners: 100,
    pretty_options: {
      colorize: true,
      single_line: true,
      hide_object: true,
      hide_error_object: false
    }
  }
}
```

### Database options (`database` section)

`DbPoolManagerOptionsProvider` reads the `database` section.

Top-level fields:

- `default_timeout`
  - positive number
  - default: `30000`
- `connections`
  - named connection map
  - each key is the connection name used later with `DbPoolManager.getDatabase(name)`

Supported connection kinds:

#### MySQL connection

- `kind`: `mysql`
- `host`
- `port`
- `username`
- `password`
- `database`
- `pool_size` (optional)

#### MariaDB connection

- `kind`: `mariadb`
- `host`
- `port`
- `username`
- `password`
- `database`
- `pool_size` (optional)

#### DuckDB connection

- `kind`: `duckdb`
- `storage`
  - `{ mode: "memory" }`
  - or `{ mode: "file", path: "..." }`
- `access_mode` (optional)
  - `read_write` or `read_only`
- `initialization.settings` (optional)
  - key/value map of DuckDB settings
- `extensions` (optional)
  - list of DuckDB extensions to load
- `attachments` (optional)
  - currently supports MySQL attachments with:
    - `type: "mysql"`
    - `alias`
    - `read_only` (optional)
    - `host`
    - `port`
    - `username`
    - `password`
    - `database`

Example:

```json5
{
  database: {
    default_timeout: 30000,
    connections: {
      processing: {
        kind: "duckdb",
        storage: {
          mode: "file",
          path: "../local_storage/processing.duckdb"
        },
        access_mode: "read_write",
        extensions: ["mysql"],
        attachments: [
          {
            type: "mysql",
            alias: "mysql_db",
            host: "127.0.0.1",
            port: 3306,
            username: "root",
            password: "root",
            database: "mysql_db"
          }
        ]
      }
    }
  }
}
```

## Usage examples

### 1) Bootstrap container, config, logging, and DB pool

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

const configurationManager = new ConfigurationManager(container);
configurationManager.addOptionsMany([
  LoggerOptionsProvider,
  DbPoolManagerOptionsProvider
]);

registerLogging(container);
registerDbPool(container);

const logger = container.resolve(LoggerFactory).create("main");
logger.info("Application started");
```

### 2) Define and register a custom options section

```ts
import { z } from "zod";
import type { OptionsTokenProvider } from "@duckdb-poc/shared-infra";

const ExportOptionsSchema = z.object({
  chunk_size: z.number().int().positive().default(250000),
  storage_path: z.string().min(1)
}).strict().transform(data => ({
  chunkSize: data.chunk_size,
  storagePath: data.storage_path
}));

type ExportOptions = z.output<typeof ExportOptionsSchema>;

export const ExportOptionsProvider: OptionsTokenProvider<ExportOptions> = {
  OptionsToken: "ExportOptions",
  SectionName: "export_service",
  hydrate: (raw: unknown) => ExportOptionsSchema.parse(raw ?? {})
};
```

Then register it during bootstrap:

```ts
configurationManager.addOptionsMany([
  LoggerOptionsProvider,
  DbPoolManagerOptionsProvider,
  ExportOptionsProvider
]);
```

That provider expects config shaped like this:

```json5
{
  logger: {
    level: "info"
  },
  database: {
    default_timeout: 30000,
    connections: {
      processing: {
        kind: "duckdb",
        storage: {
          mode: "memory"
        }
      }
    }
  },
  export_service: {
    chunk_size: 250000,
    storage_path: "../local_storage/export"
  }
}
```

Not like this:

```json5
{
  database: {
    // WRONG: `export_service` belongs at the top level, not inside `database`
    export_service: {
      chunk_size: 250000
    }
  }
}
```

### 3) Inject shared infra services in an application service

```ts
import { inject, injectable } from "tsyringe";
import {
  type AppLogger,
  type Database,
  DbPoolManager,
  LoggerFactory
} from "@duckdb-poc/shared-infra";

@injectable()
export class MyService {
  private readonly logger: AppLogger;
  private readonly db: Database;

  constructor(
    @inject(DbPoolManager) dbPoolManager: DbPoolManager,
    @inject(LoggerFactory) loggerFactory: LoggerFactory
  ) {
    this.logger = loggerFactory.create(MyService);
    this.db = dbPoolManager.getDatabase("processing");
  }

  async run(): Promise<void> {
    this.logger.info("Running query");
    await this.db.execute("select 1");
  }
}
```

### 4) Use async log context helpers

```ts
import {
  LoggerFactory,
  runWithChildLogContext,
  runWithLogContext
} from "@duckdb-poc/shared-infra";

const logger = container.resolve(LoggerFactory).create("worker");

await runWithLogContext(logger, { runId: "run-123" }, async () => {
  logger.info("Started run");

  await runWithChildLogContext({ jobId: "job-42" }, async () => {
    logger.info("Processing job");
  });
});
```

### 5) React to config changes with OptionsMonitor

```ts
import { container } from "tsyringe";
import {
  type OptionsMonitor,
  getOptionsMonitorToken,
} from "@duckdb-poc/shared-infra";

const monitor = container.resolve<OptionsMonitor<MyOptions>>(
  getOptionsMonitorToken(MyOptionsProvider)
);

// currentValue always reflects the latest reloaded value
console.log("Current port:", monitor.currentValue.port);

// Register a listener — fired after every reloadOptions / reloadAllOptions call
const stop = monitor.onChange((next) => {
  console.log("Config changed. New port:", next.port);
});

// Trigger a reload — re-reads source files from disk, hydrates, validates,
// then notifies all listeners
configurationManager.reloadAllOptions();

// Deregister when the listener is no longer needed
stop();
```

### 6) Use OptionsSnapshot for per-resolution freshness

```ts
import { container } from "tsyringe";
import {
  type OptionsSnapshot,
  getOptionsSnapshotToken,
} from "@duckdb-poc/shared-infra";

// Each resolve() call creates a NEW snapshot that captures monitor.currentValue
// at that exact moment.  The snapshot is immutable — changes after this point
// do not affect this instance.
const snapshot = container.resolve<OptionsSnapshot<MyOptions>>(
  getOptionsSnapshotToken(MyOptionsProvider)
);

console.log("Snapshot port:", snapshot.value.port);
```

Resolve the snapshot **inside** the request handler or job body (not in the constructor)
so that each invocation picks up the most recent config.

## Build and test

```powershell
npm install
npm run build    # compile TypeScript → dist/
npm test         # run ConfigurationManager unit tests (37 cases)
```

The package is consumed locally via `file:../shared-infra` from both projects.

