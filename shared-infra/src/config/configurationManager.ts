import { existsSync, readFileSync } from "node:fs";
import type { DependencyContainer, InjectionToken } from "tsyringe";
import config from "config";
import JSON5 from "json5";
import { ZodError, type ZodIssue } from "zod";
import type { Options } from "./Options.js";
import { ConfigOptions } from "./configOptions.js";
import { ConfigOptionsMonitor } from "./configOptionsMonitor.js";
import { ConfigOptionsSnapshot } from "./configOptionsSnapshot.js";
import type { OptionsMonitor } from "./optionsMonitor.js";
import { getOptionsMonitorToken, getOptionsSnapshotToken, type OptionsTokenProvider } from "./optionsTokenProvider.js";
import type { OptionsSnapshot } from "./optionsSnapshot.js";

type RegisteredOptionsEntry<T> = {
  section: string;
  provider: OptionsTokenProvider<T>;
  monitor: ConfigOptionsMonitor<T>;
};

type SourceFile = {
  path: string;
  /** json5 covers both .json5 and .json — JSON5.parse handles plain JSON too */
  type: "json5" | "unsupported";
};

export class ConfigurationManager {
  private readonly entriesByOptionsToken = new Map<InjectionToken<Options<unknown>>, RegisteredOptionsEntry<unknown>>();
  /** Lazy-captured list of config source files, populated on first addOptions call. */
  private sourceFiles: SourceFile[] | null = null;

  constructor(private readonly container: DependencyContainer) {
  }

  public addOptionsMany(providers: OptionsTokenProvider<any>[]): void {
    for (const provider of providers) {
      this.addOptions(provider);
    }
  }

  public addOptions<T>(
    sectionOrProvider: string | OptionsTokenProvider<T>,
    providerMaybe?: OptionsTokenProvider<T>
  ): void {
    // Capture source file paths once so reload can re-read from disk later.
    if (!this.sourceFiles) {
      this.sourceFiles = this.captureSourceFiles();
    }

    const provider = this.resolveProvider(sectionOrProvider, providerMaybe);
    const section = this.resolveSection(sectionOrProvider, provider);
    const optionsValue = this.resolveOptionsValue(section, provider, false);

    const existingEntry = this.entriesByOptionsToken.get(provider.OptionsToken as InjectionToken<Options<unknown>>);

    if (existingEntry) {
      (existingEntry as RegisteredOptionsEntry<T>).section = section;
      (existingEntry as RegisteredOptionsEntry<T>).provider = provider;
      (existingEntry as RegisteredOptionsEntry<T>).monitor.update(optionsValue);
      return;
    }

    const monitor = new ConfigOptionsMonitor<T>(optionsValue);
    const monitorToken = getOptionsMonitorToken(provider);
    const snapshotToken = getOptionsSnapshotToken(provider);

    this.entriesByOptionsToken.set(provider.OptionsToken as InjectionToken<Options<unknown>>, {
      section,
      provider,
      monitor
    } as RegisteredOptionsEntry<unknown>);

    this.container.register<Options<T>>(provider.OptionsToken, {
      useValue: new ConfigOptions<T>(optionsValue)
    });

    this.container.register<OptionsMonitor<T>>(monitorToken, {
      useValue: monitor
    });

    this.container.register<OptionsSnapshot<T>>(snapshotToken, {
      useFactory: () => new ConfigOptionsSnapshot<T>(() => monitor.currentValue)
    });
  }

  public reloadOptions<T>(provider: OptionsTokenProvider<T>): T {
    const entry = this.entriesByOptionsToken.get(provider.OptionsToken as InjectionToken<Options<unknown>>);
    if (!entry) {
      throw new Error("Cannot reload options before addOptions is called for this provider.");
    }

    const typedEntry = entry as RegisteredOptionsEntry<T>;
    const nextValue = this.resolveOptionsValue(typedEntry.section, typedEntry.provider, true);
    typedEntry.monitor.update(nextValue);
    return nextValue;
  }

  public reloadAllOptions(): void {
    for (const entry of this.entriesByOptionsToken.values()) {
      const typedEntry = entry as RegisteredOptionsEntry<unknown>;
      const nextValue = this.resolveOptionsValue(typedEntry.section, typedEntry.provider, true);
      typedEntry.monitor.update(nextValue);
    }
  }

  private resolveOptionsValue<T>(section: string, provider: OptionsTokenProvider<T>, fresh: boolean): T {
    const rawSectionOptions = fresh
      ? this.loadFreshSectionOptions(section)
      : this.loadSectionOptions(section);

    const mergedRawOptions = Array.isArray(rawSectionOptions)
      ? rawSectionOptions
      : this.deepMerge(provider.Defaults ?? {}, (rawSectionOptions ?? {}) as Record<string, unknown>);

    const optionsValue = this.runConfigStep(
      section,
      "hydrate",
      () => provider.hydrate ? provider.hydrate(mergedRawOptions) : (mergedRawOptions as T)
    );

    this.runConfigStep(section, "validate", () => provider.validate?.(optionsValue));

    return optionsValue;
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

  /**
   * Captures the list of config source file paths by inspecting the node-config
   * utility at startup. Called once so reload know which files to read from disk.
   */
  private captureSourceFiles(): SourceFile[] {
    const configWithUtil = config as unknown as {
      util?: { getConfigSources?: () => Array<{ name?: string }> };
    };

    const sources = configWithUtil.util?.getConfigSources?.() ?? [];
    const result: SourceFile[] = [];

    for (const source of sources) {
      if (typeof source.name !== "string") continue;
      const path = source.name;
      if (!existsSync(path)) continue;
      const ext = path.split(".").pop()?.toLowerCase() ?? "";
      const type: SourceFile["type"] = (ext === "json5" || ext === "json") ? "json5" : "unsupported";
      result.push({ path, type });
    }

    return result;
  }

  /**
   * Reads config source files fresh from disk and extracts {@link section}.
   * Falls back to the in-memory node-config cache for any file that cannot be
   * read or has an unsupported format (e.g. JS/YAML).
   */
  private loadFreshSectionOptions(section: string): unknown {
    const files = this.sourceFiles;
    if (!files || files.length === 0) {
      return this.loadSectionOptions(section);
    }

    let merged: unknown = {};
    let anyFreshRead = false;

    for (const { path, type } of files) {
      if (type === "unsupported") continue;

      try {
        const content = readFileSync(path, "utf-8");
        const parsed: unknown = JSON5.parse(content);
        if (!this.isMergeableObject(parsed)) continue;

        anyFreshRead = true;
        const sectionValue = (parsed as Record<string, unknown>)[section];
        if (Array.isArray(sectionValue)) {
          merged = sectionValue; // arrays replaced, not deep-merged (same policy as node-config layer)
        } else if (this.isMergeableObject(sectionValue)) {
          merged = this.deepMerge(merged as Record<string, unknown>, sectionValue);
        }
      } catch {
        // Unreadable / unparseable file: silently skip, other sources fill in.
      }
    }

    // If no file was successfully re-read, fall back to the cached config so
    // reload at least returns a valid value instead of empty defaults.
    if (!anyFreshRead) {
      return this.loadSectionOptions(section);
    }

    return merged;
  }

  private loadSectionOptions(section: string): unknown {
    const configWithUtil = config as unknown as {
      util?: {
        getConfigSources?: () => Array<{ parsed?: unknown }>;
      };
    };

    const configUtil = configWithUtil.util;
    if (!configUtil || typeof configUtil.getConfigSources !== "function") {
      return config.has(section)
        ? config.get<unknown>(section)
        : {};
    }

    let merged: unknown = {};
    for (const source of configUtil.getConfigSources()) {
      if (!this.isMergeableObject(source.parsed)) {
        continue;
      }

      const sectionValue = source.parsed[section];
      if (Array.isArray(sectionValue)) {
        merged = sectionValue; // arrays are replaced, not deep-merged
      } else if (this.isMergeableObject(sectionValue)) {
        merged = this.deepMerge(merged as Record<string, unknown>, sectionValue);
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

