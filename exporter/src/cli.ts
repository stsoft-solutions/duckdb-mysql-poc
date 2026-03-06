#!/usr/bin/env node
import "reflect-metadata";
import { main } from "./app/main.js";

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
