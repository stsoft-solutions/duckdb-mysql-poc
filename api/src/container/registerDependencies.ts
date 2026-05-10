import { LoggerOptions, LoggerOptionsProvider, PrettyOptions, container, registerLogging } from "@duckdb-poc/shared-infra";
import type { AppEnv } from "../config/env.js";
import { EchoService } from "../services/echoService.js";
import { HealthService } from "../services/healthService.js";

export function registerDependencies(env: AppEnv): void {
  container.register(LoggerOptionsProvider.OptionsToken, {
    useValue: {
      value: new LoggerOptions(
        env.LOG_LEVEL,
        "api",
        process.env.NODE_ENV ?? "development",
        false,
        new PrettyOptions(true, "pid,hostname,service,environment,level,time", true, true, false)
      )
    }
  });

  registerLogging(container);
  container.registerSingleton(HealthService, HealthService);
  container.registerSingleton(EchoService, EchoService);
}

export { container as appContainer };

