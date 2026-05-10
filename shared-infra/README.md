# Shared Infrastructure

Reusable infrastructure components shared by `exporter` and `api`.

## Includes

- Logger abstraction (`AppLogger`, `LoggerFactory`, `registerLogging`)
- Logger options models/provider (`LoggerOptions`, `LoggerOptionsProvider`)
- Async log context helpers (`runWithLogContext`, `runWithChildLogContext`)
- Shared configuration management (`ConfigurationManager`, `Options`, `OptionsTokenProvider`)
- Database pool infrastructure (`DbPoolManager`, providers, database adapters)

## Build

```bash
npm install
npm run build
```

The package is consumed locally via `file:../shared-infra` from both projects.

