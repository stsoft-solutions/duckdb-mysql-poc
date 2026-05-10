import { container, singleton } from "tsyringe";
import config from "config";
import { ZodError, type ZodIssue } from "zod";
import type { Options } from "./Options.js";
import { ConfigOptions } from "./configOptions.js";
import type { OptionsTokenProvider } from "./optionsTokenProvider.js";

@singleton()
export class ConfigurationManager {

  public addOptionsMany(providers: OptionsTokenProvider<any>[]): void {
    for (const provider of providers) {
      this.addOptions(provider);
    }
  }

  public addOptions<T>(
    sectionOrProvider: string | OptionsTokenProvider<T>,
    providerMaybe?: OptionsTokenProvider<T>
  ): void {
    const provider = this.resolveProvider(sectionOrProvider, providerMaybe);
    const section = this.resolveSection(sectionOrProvider, provider);

    const rawSectionOptions = this.loadSectionOptions(section);

    const mergedRawOptions = this.deepMerge(provider.Defaults ?? {}, rawSectionOptions ?? {});

    const optionsValue = this.runConfigStep(
      section,
      "hydrate",
      () => provider.hydrate ? provider.hydrate(mergedRawOptions) : (mergedRawOptions as T)
    );

    this.runConfigStep(section, "validate", () => provider.validate?.(optionsValue));

    container.register<Options<T>>(provider.OptionsToken, {
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

  private deepMerge(left: Record<string, unknown>, right: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...left };

    for (const [key, rightValue] of Object.entries(right)) {
      const leftValue = result[key];
      if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
        result[key] = this.mergeArrays(leftValue, rightValue);
        continue;
      }

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

  private loadSectionOptions(section: string): Record<string, unknown> {
    const configWithUtil = config as unknown as {
      util?: {
        getConfigSources?: () => Array<{ parsed?: unknown }>;
      };
    };

    const configUtil = configWithUtil.util;
    if (!configUtil || typeof configUtil.getConfigSources !== "function") {
      return config.has(section)
        ? config.get<Record<string, unknown>>(section)
        : {};
    }

    let merged: Record<string, unknown> = {};
    for (const source of configUtil.getConfigSources()) {
      if (!this.isMergeableObject(source.parsed)) {
        continue;
      }

      const sectionValue = source.parsed[section];
      if (this.isMergeableObject(sectionValue)) {
        merged = this.deepMerge(merged, sectionValue);
      }
    }

    return merged;
  }

  private mergeArrays(left: unknown[], right: unknown[]): unknown[] {
    if (right.length === 0) {
      return [];
    }

    const merged = [...left];
    for (let index = 0; index < right.length; index++) {
      const rightValue = right[index];
      const leftValue = left[index];

      if (this.isMergeableObject(leftValue) && this.isMergeableObject(rightValue)) {
        merged[index] = this.deepMerge(leftValue, rightValue);
      } else {
        merged[index] = rightValue;
      }
    }

    return merged;
  }

  private runConfigStep<T>(section: string, step: "hydrate" | "validate", action: () => T): T {
    try {
      return action();
    } catch (error) {
      throw new Error(this.formatConfigurationError(section, step, error));
    }
  }

  private formatConfigurationError(section: string, step: "hydrate" | "validate", error: unknown): string {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => this.formatZodIssue(section, issue)).join("\n");
      return `Invalid configuration for section '${section}' during ${step}:\n${issues}`;
    }

    if (error instanceof Error) {
      return `Invalid configuration for section '${section}' during ${step}: ${error.message}`;
    }

    return `Invalid configuration for section '${section}' during ${step}: ${String(error)}`;
  }

  private formatZodIssue(section: string, issue: ZodIssue): string {
    const path = issue.path.length > 0 ? `${section}.${issue.path.join(".")}` : section;

    if (issue.code === "unrecognized_keys") {
      return `- ${path}: unknown key(s): ${issue.keys.join(", ")}`;
    }

    if (issue.code === "invalid_type") {
      return `- ${path}: expected ${issue.expected}, received ${issue.received}`;
    }

    return `- ${path}: ${issue.message}`;
  }
}

