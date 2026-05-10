#!/usr/bin/env node
import "reflect-metadata";
import { main } from "./app/main.js";
import { container, registerLogging } from "@duckdb-poc/shared-infra";

try {
  // Set up logging before anything else to ensure that all logs are captured.
  registerLogging(container);

  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
