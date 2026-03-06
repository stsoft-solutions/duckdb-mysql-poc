import { OptionsTokenProvider } from "../config/optionsTokenProvider";

import { DbPoolManagerOptions } from "./dbPoolManagerOptions";

export const DbPoolManagerOptionsProvider: OptionsTokenProvider<DbPoolManagerOptions> = {
  OptionsToken: DbPoolManagerOptions.OptionsToken,
  SectionName: DbPoolManagerOptions.SectionName,
  hydrate: (raw) => DbPoolManagerOptions.hydrate(raw),
  validate: (options) => DbPoolManagerOptions.validate(options)
};