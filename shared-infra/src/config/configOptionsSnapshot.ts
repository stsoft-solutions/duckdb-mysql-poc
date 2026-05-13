import type { OptionsSnapshot } from "./optionsSnapshot.js";

export class ConfigOptionsSnapshot<T> implements OptionsSnapshot<T> {
  public readonly value: T;

  constructor(factory: () => T) {
    // Capture the monitor's current value once for this snapshot instance.
    this.value = factory();
  }
}
