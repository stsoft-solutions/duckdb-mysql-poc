import { container } from "tsyringe";
import { EchoService } from "../services/echoService";
import { HealthService } from "../services/healthService";

export function registerDependencies(): void {
  container.registerSingleton(HealthService, HealthService);
  container.registerSingleton(EchoService, EchoService);
}

export { container as appContainer };

