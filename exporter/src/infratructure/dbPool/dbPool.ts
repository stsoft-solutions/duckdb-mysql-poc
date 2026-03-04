import "reflect-metadata";
import { inject, injectable, singleton } from "tsyringe";
import { Options } from "../config/configurationManager";

export interface DbPoolOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

@singleton()
export class DbPool {

  constructor(@inject('') private readonly options: Options<DbPoolOptions>) {
    // Initialize the database connection pool using the provided options.
    // This is a placeholder for actual database connection pool initialization logic.
    console.log("Initializing database pool with options:", options);
  }

}