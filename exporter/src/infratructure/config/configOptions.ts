import { IOptions } from "./IOptions.js";

export class ConfigOptions<T> implements IOptions<T> {
  constructor(public readonly value: T) {
  }
}