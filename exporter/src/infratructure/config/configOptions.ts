import { Options } from "./Options";

export class ConfigOptions<T> implements Options<T> {
  constructor(public readonly value: T) {
  }
}