import { InjectionToken } from "tsyringe";
import { Options } from "./Options";

export type OptionsTokenProvider<T> = {
  OptionsToken: InjectionToken<Options<T>>;
  SectionName?: string;
  Defaults?: Record<string, unknown>;
  hydrate?: (value: unknown) => T;
  validate?: (value: T) => void;
};