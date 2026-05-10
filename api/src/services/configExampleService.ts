import { inject, singleton } from "tsyringe";
import type { AppLogger } from "@duckdb-poc/shared-infra";
import { LoggerFactory, type Options } from "@duckdb-poc/shared-infra";
import { type ApiOptions, ApiOptionsProvider } from "../config/apiOptions.js";
import type { ConfigExampleQueryDto, ConfigExampleResponseDto } from "../schemas/configExampleSchema.js";

/**
 * Example service demonstrating:
 * - Dependency injection of shared logger
 * - Dependency injection of configuration options
 * - Using these dependencies to return structured data
 * - Proper error handling and logging
 */
@singleton()
export class ConfigExampleService {
  private logger: AppLogger;

  constructor(
    @inject(LoggerFactory)
    loggerFactory: LoggerFactory,
    @inject(ApiOptionsProvider.OptionsToken)
    private apiOptionsProvider: Options<ApiOptions>
  ) {
    this.logger = loggerFactory.create("ConfigExampleService");
  }

  public getConfigInfo(query: ConfigExampleQueryDto): ConfigExampleResponseDto {
    const apiOptions = this.apiOptionsProvider.value;

    this.logger.debug("getConfigInfo called", {
      includeDetails: query.includeDetails
    });

    const response: ConfigExampleResponseDto = {
      service: "API",
      host: apiOptions.host,
      port: apiOptions.port
    };

    if (query.includeDetails) {
      response.details = {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV ?? "development"
      };

      this.logger.info("ConfigExampleService returning details", {
        host: apiOptions.host,
        port: apiOptions.port
      });
    }

    return response;
  }
}


