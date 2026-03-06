import { inject, singleton } from "tsyringe";
import { IOptions } from "../config/IOptions.js";
import { DbPoolManagerOptions } from "./dbPoolManagerOptions.js";

@singleton()
export class DbPoolManager {
  private readonly options: DbPoolManagerOptions;

  constructor(@inject(DbPoolManagerOptions.OptionsToken) options: IOptions<DbPoolManagerOptions>) {
    this.options = options.get();
    console.log("Initializing database pools:", JSON.stringify(this.options));
  }

}