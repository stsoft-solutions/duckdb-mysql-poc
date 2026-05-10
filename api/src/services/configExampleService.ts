import { inject, singleton } from "tsyringe";
import type { AppLogger } from "@duckdb-poc/shared-infra";
import {
  LoggerFactory,
  type OptionsMonitor,
  getOptionsMonitorToken,
} from "@duckdb-poc/shared-infra";
import { type ApiOptions, ApiOptionsProvider } from "../config/apiOptions.js";
import type { ConfigExampleQueryDto, ConfigExampleResponseDto } from "../schemas/configExampleSchema.js";

/**
 * Example service demonstrating:
 * - Dependency injection of shared logger
 * - OptionsMonitor<T>: config is read on every request from monitor.currentValue,
 *   so a POST to /v1/example/secured/admin/reload-config immediately takes effect
 *   without restarting the process.
 */
@singleton()
export class ConfigExampleService {
  private readonly logger: AppLogger;

  constructor(
    @inject(LoggerFactory)
    loggerFactory: LoggerFactory,
    @inject(getOptionsMonitorToken(ApiOptionsProvider))
    private readonly apiOptionsMonitor: OptionsMonitor<ApiOptions>
  ) {
    this.logger = loggerFactory.create("ConfigExampleService");
  }

  public getConfigInfo(query: ConfigExampleQueryDto): ConfigExampleResponseDto {
    // Read currentValue here — not in the constructor — so every request
    // reflects the latest value pushed by ConfigurationManager.reloadAllOptions().
    const opts = this.apiOptionsMonitor.currentValue;

    this.logger.debug("getConfigInfo called", { includeDetails: query.includeDetails });

    const response: ConfigExampleResponseDto = {
      service: "API",
      host: opts.host,
      port: opts.port,
      validate_responses: opts.validate_responses,
      rate_limit: {
        enabled: opts.rate_limit.enabled,
        auth_endpoints: {
          window_ms: opts.rate_limit.auth_endpoints.window_ms,
          max_per_ip: opts.rate_limit.auth_endpoints.max_per_ip,
          max_per_consumer: opts.rate_limit.auth_endpoints.max_per_consumer,
        },
        sensitive_endpoints: {
          window_ms: opts.rate_limit.sensitive_endpoints.window_ms,
          max_per_ip: opts.rate_limit.sensitive_endpoints.max_per_ip,
          max_per_consumer: opts.rate_limit.sensitive_endpoints.max_per_consumer,
        },
      },
    };

    if (query.includeDetails) {
      response.details = {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV ?? "development",
      };

      this.logger.info("ConfigExampleService returning details", {
        host: opts.host,
        port: opts.port,
      });
    }

    return response;
  }
}

