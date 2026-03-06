import { container, InjectionToken, singleton } from "tsyringe";
import config from "config";

export interface IOptions<T> {
  get(): T;
}

export class ConfigOptions<T> implements IOptions<T> {
  constructor(private readonly value: T) {
  }

  public get(): T {
    return this.value;
  }
}

export type OptionsTokenProvider<T> = {
  OptionsToken: InjectionToken<IOptions<T>>;
  SectionName?: string;
  Defaults?: Record<string, unknown>;
  hydrate?: (value: unknown) => T;
  validate?: (value: T) => void;
};

@singleton()
export class ConfigurationManager {

  public addOptions<T>(
    sectionOrProvider: string | OptionsTokenProvider<T>,
    providerMaybe?: OptionsTokenProvider<T>
  ): void {
    const provider = this.resolveProvider(sectionOrProvider, providerMaybe);
    const section = this.resolveSection(sectionOrProvider, provider);

    const rawSectionOptions = config.has(section)
      ? config.get<Record<string, unknown>>(section)
      : {};

    const mergedRawOptions = this.deepMerge(provider.Defaults ?? {}, rawSectionOptions ?? {});
    const optionsValue = provider.hydrate
      ? provider.hydrate(mergedRawOptions)
      : (mergedRawOptions as T);

    provider.validate?.(optionsValue);

    container.register<IOptions<T>>(provider.OptionsToken, {
      useValue: new ConfigOptions<T>(optionsValue)
    });
  }

  private resolveProvider<T>(
    sectionOrProvider: string | OptionsTokenProvider<T>,
    providerMaybe?: OptionsTokenProvider<T>
  ): OptionsTokenProvider<T> {
    if (typeof sectionOrProvider === "string") {
      if (!providerMaybe) {
        throw new Error("Configuration provider is required when section is passed explicitly.");
      }
      return providerMaybe;
    }
    return sectionOrProvider;
  }

  private resolveSection<T>(
    sectionOrProvider: string | OptionsTokenProvider<T>,
    provider: OptionsTokenProvider<T>
  ): string {
    if (typeof sectionOrProvider === "string") {
      return sectionOrProvider;
    }

    if (!provider.SectionName) {
      throw new Error("SectionName is required when addOptions is called with provider only.");
    }

    return provider.SectionName;
  }

  // Minimal deep merge for config objects; arrays are replaced by right-hand values.
  private deepMerge(left: Record<string, unknown>, right: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...left };

    for (const [key, rightValue] of Object.entries(right)) {
      const leftValue = result[key];
      if (this.isMergeableObject(leftValue) && this.isMergeableObject(rightValue)) {
        result[key] = this.deepMerge(leftValue, rightValue);
      } else {
        result[key] = rightValue;
      }
    }

    return result;
  }

  private isMergeableObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }
}