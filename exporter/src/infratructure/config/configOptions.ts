import { IOptions } from "./IOptions.js";

export class ConfigOptions<T> implements IOptions<T> {
  constructor(private readonly value: T) {
  }

  public get(): T {
    return this.value;
  }
}