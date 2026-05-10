import "reflect-metadata";
import { LOGGER_TOKENS, LoggerFactory, type Options, RootLogger } from "@duckdb-poc/shared-infra";
import { container } from "tsyringe";
import { type ApiOptions, ApiOptionsProvider } from "./config/apiOptions.js";
import { registerDependencies } from "./container/registerDependencies.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  registerDependencies();

  const apiOptions = container.resolve<Options<ApiOptions>>(ApiOptionsProvider.OptionsToken).value;
  const rootLogger = container.resolve<RootLogger>(LOGGER_TOKENS.RootLogger);
  const logger = container.resolve(LoggerFactory).create("main");

  const app = await buildServer({
    loggerInstance: rootLogger.toPinoLogger().child({ component: "fastify" })
  }, {
    validateResponses: apiOptions.validate_responses,
  });

  await app.listen({
    host: apiOptions.host,
    port: apiOptions.port
  });

  logger.info(`API listening on http://${apiOptions.host}:${apiOptions.port}`);
  logger.info(`OpenAPI docs on http://${apiOptions.host}:${apiOptions.port}/docs`);
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

