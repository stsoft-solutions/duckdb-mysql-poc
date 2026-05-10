export type OptionsChangeListener<T> = (nextValue: T) => void;

export interface OptionsMonitor<T> {
  readonly currentValue: T;
  onChange(listener: OptionsChangeListener<T>): () => void;
}
