#!/usr/bin/env node
import "reflect-metadata";
import { main } from "./app/main.js";

import config from 'config';

interface IDatabaseOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}


const dbConfig = config.get<IDatabaseOptions>('database');

console.log(dbConfig.host);

process.exitCode = await main(process.argv.slice(2));
