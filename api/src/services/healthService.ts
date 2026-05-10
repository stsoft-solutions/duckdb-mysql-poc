import { injectable } from "@duckdb-poc/shared-infra";

@injectable()
export class HealthService {
  public getStatus() {
    return {
      status: "ok",
      timestamp: new Date().toISOString()
    };
  }
}

