<!-- TOC -->
* [Exporter](#exporter)
* [Development patterns and conventions are used in this project.](#development-patterns-and-conventions-are-used-in-this-project)
  * [Options Pattern](#options-pattern)
    * [Core Types](#core-types)
    * [How to Add a New Options Section](#how-to-add-a-new-options-section)
      * [Step 1 — Define a strict Zod schema](#step-1--define-a-strict-zod-schema)
      * [Step 2 — Export the options type](#step-2--export-the-options-type)
      * [Step 3 — Export the provider](#step-3--export-the-provider)
      * [Step 4 — Register providers in `app/main.ts`](#step-4--register-providers-in-appmaints)
      * [Step 5 — Inject into a service](#step-5--inject-into-a-service)
      * [Step 6 — Add the section to `config/default.json5`](#step-6--add-the-section-to-configdefaultjson5)
    * [Validation Error Messages](#validation-error-messages)
    * [When to Use `validate`](#when-to-use-validate)
    * [Defaults](#defaults)
  * [Logger](#logger)
    * [Configuration](#configuration)
      * [Pretty output format](#pretty-output-format)
    * [Injecting the logger](#injecting-the-logger)
    * [Scoped log context](#scoped-log-context)
* [Project Setup](#project-setup)
<!-- TOC -->

# Exporter

A CLI application that exports data from MySQL to DuckDB.

Current default flow in `src/app/main.ts`:

- Exports monthly data for `order_mt4`, `order_mt5`, and `order_mt6`
- Writes final parquet files to `../local_storage/export/<table>/year=<YYYY>/month=<M>`
- Uses `../local_storage/temp/<table>/<YYYY>/<M>` for chunk files, then consolidates and cleans temp data

```powershell
npx tsx src/cli.ts
```

---

# Development patterns and conventions are used in this project.

## Options Pattern

This project uses a typed configuration pattern built on top
of [node-config](https://github.com/node-config/node-config) and [tsyringe](https://github.com/microsoft/tsyringe). The
pattern provides:

- Strongly typed access to configuration sections
- Runtime validation via [Zod](https://zod.dev)
- Explicit snake_case to camelCase transformation at the configuration boundary
- Dependency injection of configuration into services

### Core Types

**`Options<T>`** — a read-only wrapper injected into services:

```ts
export interface Options<T> {
  readonly value: T;
}
```

**`OptionsTokenProvider<T>`** — describes how to load, transform, and validate a config section:

```ts
export type OptionsTokenProvider<T> = {
  OptionsToken: InjectionToken<Options<T>>;
  SectionName?: string;
  Defaults?: Record<string, unknown>;
  hydrate?: (value: unknown) => T;
  validate?: (value: T) => void;
};
```

**`ConfigurationManager`** — singleton that orchestrates loading:

1. Loads the section from `node-config` sources and merges them in source order
2. Deep-merges `Defaults` into the resolved section (`Defaults` first, section overrides second)
3. Merges arrays by index (object entries are deep-merged; primitive entries are replaced)
3. Calls `hydrate()` to produce a typed value
4. Calls `validate()` when the provider defines additional post-hydration checks
5. Registers `ConfigOptions<T>` in the tsyringe container under `OptionsToken`

---

### How to Add a New Options Section

Best practice in this project is to keep each options section compact:

- Validate the raw config shape with a strict Zod schema.
- Use `.transform(...)` to convert config-file names like `max_retries` to TypeScript names like `maxRetries`.
- Export the options type from `z.output<typeof Schema>`.
- Inject using the provider's `OptionsToken`.

Use `.js` in relative imports because the project uses Node ESM with `NodeNext`; TypeScript resolves those imports back
to the `.ts` source files.

#### Step 1 — Define a strict Zod schema

```ts
import { z } from "zod";
import type { OptionsTokenProvider } from "@infrastructure/config/optionsTokenProvider.js";

const FooOptionsSchema = z
  .object({
    max_retries: z.number().int().positive().default(3),
    base_url: z.string().url(),
  })
  .strict()
  .transform(data => ({
    maxRetries: data.max_retries,
    baseUrl: data.base_url,
  }));
```

The schema matches `config/default.json5` before `.transform(...)`, and matches the application type after
`.transform(...)`.

#### Step 2 — Export the options type

```ts
export type FooOptions = z.output<typeof FooOptionsSchema>;
```

Prefer this over a hand-written options class unless you need methods or complex invariants. The Zod output type stays
aligned with the schema automatically.

#### Step 3 — Export the provider

```ts
export const FooOptionsProvider: OptionsTokenProvider<FooOptions> = {
  OptionsToken: "FooOptions",
  SectionName: "foo",
  hydrate: (raw: unknown) => FooOptionsSchema.parse(raw ?? {})
};
```

`OptionsToken` must be stable and unique. `SectionName` points to the key in `config/default.json5`.

#### Step 4 — Register providers in `app/main.ts`

```ts
configurationManager.addOptionsMany([
  LoggerOptionsProvider,
  DbPoolManagerOptionsProvider,
  ExportServiceOptionsProvider,
  FooOptionsProvider
]);
```

Call this before resolving any service that depends on options. Registration order matters because tsyringe resolves
tokens eagerly when services are constructed.

You may also pass an explicit section name to override `SectionName` at call-site — useful for environment-specific
overrides or testing:

```ts
configurationManager.addOptions("foo_override", FooOptionsProvider);
```

#### Step 5 — Inject into a service

```ts
import { inject, injectable } from "tsyringe";
import type { Options } from "@infrastructure/config/Options.js";
import { FooOptionsProvider, type FooOptions } from "./fooOptions.js";

@injectable()
export class FooService {
  private readonly options: FooOptions;

  constructor(
    @inject(FooOptionsProvider.OptionsToken) options: Options<FooOptions>
  ) {
    this.options = options.value;
  }
}
```

Use the provider token instead of repeating the raw string in the service. Assigning `options.value` in the constructor
keeps the rest of the class free of the `Options<T>` wrapper.

#### Step 6 — Add the section to `config/default.json5`

```json5
{
  foo: {
    base_url: "https://example.com",
    // max_retries will use the schema default (3) if omitted
  }
}
```

---

### Validation Error Messages

`ConfigurationManager` catches `ZodError` and formats it with section and field path:

```
Invalid configuration for section 'foo' during hydrate:
- foo.base_url: Invalid url
- foo.max_retries: expected number, received string
```

Unknown keys in `.strict()` schemas produce:

```
- foo: unknown key(s): typo_field
```

---

### When to Use `validate`

For most options sections, put parsing, defaults, validation, and shape conversion in the Zod schema used by `hydrate`.

Use provider `validate` only when a check is awkward to express in the schema or depends on the fully hydrated object.
Examples include cross-section checks or invariants that require application services. Keep it rare; duplicated raw and
hydrated schemas are usually unnecessary.

---

### Defaults

Prefer Zod `.default()` inside the schema:

```ts
const FooOptionsSchema = z.object({
  max_retries: z.number().int().positive().default(3),
}).strict();
```

Use provider `Defaults` only when you need a deep merge before parsing, for example when a whole nested object should be
merged with config-file values.

Array behavior in `ConfigurationManager` is index-based:

- Empty override array clears the target array
- Object items at the same index are deep-merged
- Non-object items replace the target value at that index

This is useful for local secret overrides without duplicating the whole object. Example (`config/local.json5` overriding
`config/default.json5`):

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


---

## Logger

The logger is backed by [pino](https://getpino.io) and integrated via tsyringe DI.

### Configuration

Add a `logger` section to your config file (e.g. `exporter/config/default.json5`):

```json5
{
  logger: {
    level: "info",
    // fatal | error | warn | info | debug | trace | silent (default: "info")
    service_name: "exporter",
    // included in every JSON log line (default: "exporter")
    environment: "production",
    // included in every JSON log line (default: NODE_ENV or "development")
    pretty: false,
    // enable human-readable output via pino-pretty (default: false)
    pretty_options: {
      colorize: true,
      // colorize output with colorette; auto-disabled in CI (default: true)
      ignore: "pid,hostname,service,environment,level,time",
      // fields hidden by pino-pretty (default shown)
      single_line: true,
      // collapse extra fields to one line (default: true)
      hide_object: true,
      // suppress extra binding fields after the message (default: true)
      hide_error_object: false
      // when hide_object=true, still print err.stack on errors (default: false)
    }
  }
}
```

`pretty_options` is only used when `pretty: true`. In production (JSON mode) all fields are always present in the
structured output.

#### Pretty output format

When `pretty: true` the log line is formatted as:

```
2026-04-23T10:00:00.000Z (info) myComponent: message text [requestId]
2026-04-23T10:00:00.000Z (err)  myComponent: something failed [requestId]
Error: something failed
    at Object.<anonymous> (src/services/myService.ts:42:15)
```

- **level label** — `err` is used instead of `error` to keep alignment
- **component** — the `component` binding from a child logger (e.g. `logger.child({ component: "db" })`)
- **requestId / runId** — printed as `[value]` when present as a binding
- **error stack** — shown below the message line when `hide_error_object: false` and `hide_object: true`

In JSON mode the output includes all fields (`service`, `environment`, `level`, `time`, `message`, plus any bindings).

### Injecting the logger

Inject `LoggerFactory` and create a component logger in the constructor. The returned logger resolves the current logger
lazily on each log call, so `runWithLogContext` bindings continue to flow even when the service is constructed before
the async scope starts.

Logger argument order is now consistent:
- `trace|debug|info|warn(message, bindings?)`
- `error|fatal(message, bindings?)`
- `error|fatal(thrown, message?, bindings?)` where `thrown` can be `unknown`

With `verbatimModuleSyntax: true`, use `import type` for symbols used only as types.

```typescript
import { LoggerFactory } from "@infrastructure/logger/loggerFactory.js";
import type { AppLogger } from "@infrastructure/logger/appLogger.js";

@injectable()
class MyService {
  private readonly logger: AppLogger;

  constructor(private readonly loggerFactory: LoggerFactory) {
    this.logger = loggerFactory.create(MyService);
  }

  doWork() {
    this.logger.info("plain message");
    this.logger.info("message with bindings", { userId: 42, action: "export" });
    this.logger.error(new Error("something went wrong"), "export failed", { userId: 42 });
    this.logger.error("validation failed", { userId: 42, reason: "missing input" });
    this.logger.error({ reason: "upstream returned invalid payload" }, "export failed", { userId: 42 });
    this.logger.fatal(new Error("storage unavailable"), "cannot continue", { userId: 42 });
    this.logger.fatal("shutting down worker", { reason: "fatal dependency error" });
  }
}
```

For non-`Error` thrown values, the logger creates a fallback `Error("Non-Error value was thrown")` and includes the
original value as `thrownValue` in structured bindings.

Register the logging module once during bootstrap:

```typescript
import { registerLogging } from "@infrastructure/logger/registerLogging.js";

registerLogging(container);
```

### Scoped log context

Use `runWithLogContext` / `runWithChildLogContext` to attach bindings to all log calls within an async scope. The
bindings are propagated automatically via `AsyncLocalStorage` — no need to thread the logger manually.

```typescript
import { runWithLogContext, runWithChildLogContext } from "@infrastructure/logger/loggingContext.js";

// Start a new context from a base logger
runWithLogContext(rootLogger, { requestId: "abc-123" }, () => {
  logger.info("this line includes requestId automatically");
});

// Extend the current context (or no-op if none exists)
runWithChildLogContext({ jobId: "job-456" }, () => {
  logger.info("this line includes both requestId and jobId");
});
```

# Project Setup

```bash
npm init -y
npm i -D typescript tsx @types/node
```

**`package.json`**

```json
{
  "name": "mycli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "mycli": "dist/cli.js"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc -p tsconfig.build.json && tsc-alias -p tsconfig.build.json",
    "start": "npm run build && node dist/cli.js",
    "lint": "eslint .",
    "test": "node --test"
  },
  "engines": {
    "node": ">=20"
  }
}
```

**`tsconfig.json`** — type-checking only, no emit

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "baseUrl": ".",
    "paths": {
      "@infrastructure/*": ["src/infrastructure/*"]
    }
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

`experimentalDecorators` and `emitDecoratorMetadata` are required by tsyringe. `NodeNext` matches Node's ESM runtime
behavior, so relative imports in `.ts` files should use the emitted `.js` extension. With `verbatimModuleSyntax: true`,
imports that are type-only must use `import type`:

```ts
import { Foo } from "./foo.js";
import type { FooOptions } from "./fooOptions.js";
```

**`tsconfig.build.json`** — production build

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "moduleResolution": "NodeNext",
    "module": "NodeNext"
  },
  "include": [
    "src/**/*.ts"
  ]
}
```
