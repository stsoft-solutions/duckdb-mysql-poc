import type { Options } from "./Options.js";

export class ConfigOptions<T> implements Options<T> {
  constructor(public readonly value: T) {
  }
}

