import { ConfigurationManager, LoggerOptionsProvider, registerLogging } from "@duckdb-poc/shared-infra";
import { container } from "tsyringe";
import { ApiOptionsProvider } from "../config/apiOptions.js";
import { EchoService } from "../services/echoService.js";
import { HealthService } from "../services/healthService.js";

export function registerDependencies(): void {
  const configurationManager = new ConfigurationManager(container);

  configurationManager.addOptionsMany([
    LoggerOptionsProvider,
    ApiOptionsProvider
  ]);

  registerLogging(container);
  container.registerSingleton(HealthService, HealthService);
  container.registerSingleton(EchoService, EchoService);
}

export { container as appContainer };

