import {
  ConfigurationManager,
  DbPoolManagerOptionsProvider,
  LoggerOptionsProvider,
  registerDbPool,
  registerLogging
} from "@duckdb-poc/shared-infra";
import { container } from "tsyringe";
import { ApiOptionsProvider } from "../config/apiOptions.js";
import { SqlQueryOptionsProvider } from "../config/sqlQueryOptions.js";

let configurationManager: ConfigurationManager | null = null;

export function registerDependencies(): void {
  configurationManager = new ConfigurationManager(container);

  configurationManager.addOptionsMany([
    LoggerOptionsProvider,
    ApiOptionsProvider,
    DbPoolManagerOptionsProvider,
    SqlQueryOptionsProvider
  ]);

  registerLogging(container);
  registerDbPool(container);
}

export function reloadConfiguration(): void {
  if (!configurationManager) {
    throw new Error("Dependencies are not registered. Call registerDependencies() first.");
  }

  configurationManager.reloadAllOptions();
}

export { container as appContainer };

