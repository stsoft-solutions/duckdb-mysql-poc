import { singleton } from "tsyringe";

@singleton()
export class HealthService {
  public getStatus() {
    return {
      status: "ok",
      timestamp: new Date().toISOString()
    };
  }
}

