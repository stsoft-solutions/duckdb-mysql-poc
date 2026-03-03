#!/usr/bin/env node
import { main } from "./lib/main.js";

import config from 'config';

const port = config.get<number>("server.port");
const dbHost = config.get<string>("database.host");

const dbConfig = config.get('database');

process.exitCode = await main(process.argv.slice(2));
