import { ConfigurationManager, LoggerOptionsProvider, registerLogging } from "@duckdb-poc/shared-infra";
import { container } from "tsyringe";
import { ApiOptionsProvider } from "../config/apiOptions.js";

export function registerDependencies(): void {
  const configurationManager = new ConfigurationManager(container);

  configurationManager.addOptionsMany([
    LoggerOptionsProvider,
    ApiOptionsProvider
  ]);

  registerLogging(container);
}

export { container as appContainer };

