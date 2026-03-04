import { container, singleton } from "tsyringe";
import config from "config";

export interface Options<T>{
  get(): T;
}

export class ConfigOptions<T> implements Options<T> {
  constructor(private readonly section: string) {
  }

  public get(): T {
    return config.get<T>(this.section);
  }
}

@singleton()
export class ConfigurationManager {

  public addOptions<T>(section: string) {
    // Create a unique token for the options type based on the type parameter name.

    const options = new ConfigOptions<T>(section);
    const optionsToken = `${section}Options` as const;

    // Register the options instance in the container with the unique token.
    container.register<Options<T>>(optionsToken, { useValue: options });
  }
}