import type { InjectionToken } from "tsyringe";
import type { Options } from "./Options.js";
import type { OptionsMonitor } from "./optionsMonitor.js";
import type { OptionsSnapshot } from "./optionsSnapshot.js";

export type OptionsTokenProvider<T> = {
  OptionsToken: InjectionToken<Options<T>>;
  MonitorToken?: InjectionToken<OptionsMonitor<T>>;
  SnapshotToken?: InjectionToken<OptionsSnapshot<T>>;
  SectionName?: string;
  Defaults?: Record<string, unknown>;
  hydrate?: (value: unknown) => T;
  validate?: (value: T) => void;
};

function deriveToken<T>(token: InjectionToken<Options<T>>, kind: "monitor" | "snapshot"):
  InjectionToken<OptionsMonitor<T>> | InjectionToken<OptionsSnapshot<T>> {
  if (typeof token === "string") {
    return `${token}:${kind}`;
  }

  if (typeof token === "symbol") {
    return Symbol.for(`${token.description ?? "options"}:${kind}`);
  }

  if (typeof token === "function") {
    return `${token.name || "options"}:${kind}`;
  }

  throw new Error(`Unable to derive an ${kind} token from the provided OptionsToken.`);
}

export function getOptionsMonitorToken<T>(provider: OptionsTokenProvider<T>): InjectionToken<OptionsMonitor<T>> {
  return provider.MonitorToken ?? deriveToken(provider.OptionsToken, "monitor") as InjectionToken<OptionsMonitor<T>>;
}

export function getOptionsSnapshotToken<T>(provider: OptionsTokenProvider<T>): InjectionToken<OptionsSnapshot<T>> {
  return provider.SnapshotToken ?? deriveToken(provider.OptionsToken, "snapshot") as InjectionToken<OptionsSnapshot<T>>;
}

