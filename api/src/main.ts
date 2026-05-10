import "reflect-metadata";
import { readEnv } from "./config/env";
import { registerDependencies } from "./container/registerDependencies";
import { buildServer } from "./server";

async function main(): Promise<void> {
  const env = readEnv();
  registerDependencies();

  const app = await buildServer({
    logger: {
      level: env.LOG_LEVEL
    }
  });

  await app.listen({
    host: env.HOST,
    port: env.PORT
  });

  app.log.info(`API listening on http://${env.HOST}:${env.PORT}`);
  app.log.info(`OpenAPI docs on http://${env.HOST}:${env.PORT}/docs`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

