import type { InjectionToken } from "tsyringe";
import type { Options } from "./Options.js";

export type OptionsTokenProvider<T> = {
  OptionsToken: InjectionToken<Options<T>>;
  SectionName?: string;
  Defaults?: Record<string, unknown>;
  hydrate?: (value: unknown) => T;
  validate?: (value: T) => void;
};

