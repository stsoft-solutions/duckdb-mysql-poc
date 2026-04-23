# Exporter

A CLI application that exports data from MySQL to DuckDB.

```powershell
npx tsx src/cli.ts
```

---

## Options Pattern

This project uses a typed configuration pattern built on top of [node-config](https://github.com/node-config/node-config) and [tsyringe](https://github.com/microsoft/tsyringe). The pattern provides:

- Strongly-typed access to configuration sections
- Runtime validation via [Zod](https://zod.dev)
- Automatic snake_case → camelCase transformation
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
  OptionsToken: InjectionToken<Options<T>>;  // DI registration key
  SectionName?: string;                       // key in config/default.json5
  Defaults?: Record<string, unknown>;         // merged before hydration
  hydrate?: (value: unknown) => T;            // parse raw JSON → typed object
  validate?: (value: T) => void;              // post-hydration check
};
```

**`ConfigurationManager`** — singleton that orchestrates loading:

1. Reads the raw section from `node-config`
2. Deep-merges `Defaults` (objects merged, arrays replaced)
3. Calls `hydrate()` to produce a typed value
4. Calls `validate()` for a final correctness check
5. Registers `ConfigOptions<T>` in the tsyringe container under `OptionsToken`

---

### How to Add a New Options Section

#### Step 1 — Define the raw and hydrated Zod schemas

Use two separate schemas: one that matches the JSON file shape (snake_case), and one that matches the TypeScript class shape (camelCase). This makes transformation errors visible at the boundary.

```ts
// Raw shape from config/default.json5
const RawFooSchema = z.object({
  max_retries: z.number().int().positive().default(3),
  base_url: z.string().url()
}).strict();

// Hydrated shape consumed in code
const HydratedFooSchema = z.object({
  maxRetries: z.number().int().positive(),
  baseUrl: z.string().url()
}).strict();
```

#### Step 2 — Define the options class

```ts
export class FooOptions {
  constructor(
    public readonly maxRetries: number,
    public readonly baseUrl: string
  ) {}
}
```

#### Step 3 — Export the provider

Co-locate `OptionsToken` and `SectionName` as static constants on the class (as in `DbPoolManagerOptions`) or inline them in the provider object. Either style is fine; the important thing is that `OptionsToken` is a stable, unique string used both here and in the `@inject()` decorator.

```ts
export const FooOptionsProvider: OptionsTokenProvider<FooOptions> = {
  OptionsToken: "FooOptions",
  SectionName: "foo",
  Defaults: { max_retries: 3 },
  hydrate: (raw: unknown) => {
    const parsed = RawFooSchema.parse(raw ?? {});
    return new FooOptions(parsed.max_retries, parsed.base_url);
  },
  validate: (options: FooOptions) => HydratedFooSchema.parse(options)
};
```

#### Step 4 — Register in `app/main.ts`

```ts
configurationManager.addOptions(FooOptionsProvider);
```

Call `addOptions` before resolving any service that depends on `FooOptions`. Registration order matters because tsyringe resolves tokens eagerly when the service is constructed.

You may also pass an explicit section name to override `SectionName` at call-site — useful for environment-specific overrides or testing:

```ts
configurationManager.addOptions("foo_override", FooOptionsProvider);
```

#### Step 5 — Inject into a service

```ts
@injectable()
export class FooService {
  private readonly options: FooOptions;

  constructor(
    @inject("FooOptions") options: Options<FooOptions>
  ) {
    this.options = options.value;
  }
}
```

Using `options.value` in the constructor assignment keeps the rest of the class free of the `Options<T>` wrapper.

#### Step 6 — Add the section to `config/default.json5`

```json5
{
  foo: {
    base_url: "https://example.com",
    // max_retries will use the Defaults value (3) if omitted
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

### Choosing `hydrate` vs `validate`

| | `hydrate` | `validate` |
|---|---|---|
| Input | raw `unknown` from JSON | typed `T` instance |
| Purpose | parse + transform | sanity-check the result |
| When to use | always | when extra invariants are needed beyond Zod's transform |

For simple cases (like `ExportServiceOptions`) a single Zod schema with `.transform()` inside `hydrate` is sufficient and `validate` can be omitted. For cases where the hydrated object is a class with complex invariants (like `DbPoolManagerOptions`), add a second schema in `validate`.

---

### `Defaults` vs Zod `.default()`

Both work, but they sit at different layers:

- **`Defaults`** (in the provider) — applied before hydration, via deep merge. Use these for top-level keys that may be absent from the config file entirely.
- **Zod `.default()`** — applied inside the raw schema parse. Use these for nested keys or when the default value needs to be part of the schema definition.

You can combine both safely; `Defaults` fill in missing top-level keys, then Zod fills in missing nested keys.

---

### Project Setup

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
  "files": ["dist"],
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/cli.js",
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
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

`experimentalDecorators` and `emitDecoratorMetadata` are required by tsyringe.

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
  "include": ["src/**/*.ts"]
}
```
