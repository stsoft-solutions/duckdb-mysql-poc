import { OptionsTokenProvider } from "../config/optionsTokenProvider.js";

import { DbPoolManagerOptions } from "./dbPoolManagerOptions.js";

export const DbPoolManagerOptionsProvider: OptionsTokenProvider<DbPoolManagerOptions> = {
  OptionsToken: DbPoolManagerOptions.OptionsToken,
  SectionName: DbPoolManagerOptions.SectionName,
  Defaults: DbPoolManagerOptions.Defaults,
  hydrate: (raw: unknown) => DbPoolManagerOptions.hydrate(raw),
  validate: (options: DbPoolManagerOptions) => DbPoolManagerOptions.validate(options)
};