import type { OptionsChangeListener, OptionsMonitor } from "./optionsMonitor.js";

export class ConfigOptionsMonitor<T> implements OptionsMonitor<T> {
  private readonly listeners = new Set<OptionsChangeListener<T>>();

  constructor(private current: T) {
  }

  public get currentValue(): T {
    return this.current;
  }

  public onChange(listener: OptionsChangeListener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public update(nextValue: T): void {
    this.current = nextValue;

    for (const listener of this.listeners) {
      listener(nextValue);
    }
  }
}
