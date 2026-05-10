import "reflect-metadata";
import { LoggerFactory } from "@duckdb-poc/shared-infra";
import { container } from "tsyringe";
import { readEnv } from "./config/env.js";
import { registerDependencies } from "./container/registerDependencies.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const env = readEnv();
  registerDependencies(env);
  const logger = container.resolve(LoggerFactory).create("main");

  const app = await buildServer({
    logger: {
      level: env.LOG_LEVEL
    }
  });

  await app.listen({
    host: env.HOST,
    port: env.PORT
  });

  logger.info(`API listening on http://${env.HOST}:${env.PORT}`);
  logger.info(`OpenAPI docs on http://${env.HOST}:${env.PORT}/docs`);
}

main().catch((error) => {
  try {
    const logger = container.resolve(LoggerFactory).create("main");
    logger.fatal(error, "API failed to start");
  } catch {
    console.error(error);
  }
  process.exit(1);
});

