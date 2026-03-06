import { InjectionToken } from "tsyringe";
import { IOptions } from "./IOptions";

export type OptionsTokenProvider<T> = {
  OptionsToken: InjectionToken<IOptions<T>>;
  SectionName?: string;
  Defaults?: Record<string, unknown>;
  hydrate?: (value: unknown) => T;
  validate?: (value: T) => void;
};