#!/usr/bin/env node
import "reflect-metadata";
import { main } from "./app/main.js";

import config from "config";

interface IDatabaseOptions {
  default_timeout: number;
  connections: Record<string, {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  }>;
}

const dbConfig = config.get<IDatabaseOptions>("database");
console.log(dbConfig.connections.primary?.host);

process.exitCode = await main(process.argv.slice(2));
