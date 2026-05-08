import { inject, singleton } from "tsyringe";
import { AppLogger } from "./appLogger.js";
import { ComponentLogger } from "./componentLogger.js";
import { LogBindings } from "./logBindings.js";
import { LoggerAccessor } from "./loggerAccessor.js";

type ComponentType = { name: string };

@singleton()
export class LoggerFactory {
  constructor(@inject(LoggerAccessor) private readonly loggerAccessor: LoggerAccessor) {
  }

  public create(component: string | ComponentType, bindings: LogBindings = {}): AppLogger {
    const componentName = typeof component === "string" ? component : component.name;

    return new ComponentLogger(this.loggerAccessor, {
      component: componentName,
      ...bindings
    });
  }
}
