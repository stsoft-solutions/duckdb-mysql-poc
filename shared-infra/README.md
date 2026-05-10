<!-- TOC -->
* [Shared Infrastructure](#shared-infrastructure)
  * [What this package provides](#what-this-package-provides)
  * [Components](#components)
    * [Configuration components](#configuration-components)
    * [Logging components](#logging-components)
    * [Database components](#database-components)
  * [Important DI note](#important-di-note)
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
  * [Build](#build)
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
- `OptionsTokenProvider<T>`
  - describes how a config section is loaded
  - defines the DI token, section name, optional defaults, hydration, and validation
- `ConfigurationManager`
  - reads config sections from `node-config`
  - applies defaults
  - hydrates raw JSON-like config into typed objects
  - registers the final `Options<T>` value into a `tsyringe` container

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

## Build

```powershell
npm install
npm run build
```

The package is consumed locally via `file:../shared-infra` from both projects.

