import { container, singleton } from "tsyringe";
import config from "config";
import { ZodError, ZodIssue } from "zod";
import { Options } from "./Options";
import { ConfigOptions } from "./configOptions";
import { OptionsTokenProvider } from "./optionsTokenProvider";

/**
 * ConfigurationManager is a singleton class responsible for managing configuration options
 * for different sections of the application. It supports registering, merging, and validating
 * configurations based on the provided options and their schemas.
 *
 * This class uses a provider-based approach for dynamic configuration management and ensures
 * that configurations are validated and processed before being registered for later use.
 *
 * Features:
 * - Adds configuration options for specific sections or providers.
 * - Validates and hydrates configuration values based on provider logic.
 * - Performs deep merging of configuration objects, excluding arrays.
 * - Handles and formats configuration errors with descriptive messages.
 * - Supports validation integration with a Zod library for structured validation.
 *
 * Typical workflow:
 * - Resolve configuration provider and section names.
 * - Deep merge default and raw configuration values.
 * - Hydrate the final configuration values through the provider's logic.
 * - Validate the hydrated configuration.
 * - Register the processed configuration values for further access.
 */
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

    const rawSectionOptions = config.has(section)
      ? config.get<Record<string, unknown>>(section)
      : {};

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
