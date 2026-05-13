import { inject, singleton } from "tsyringe";
import type { AppLogger } from "@duckdb-poc/shared-infra";
import { LoggerFactory } from "@duckdb-poc/shared-infra";
import type { SecuredResourceQueryDto, SecuredResourceResponseDto, } from "../schemas/securedResourceSchema.js";

const MOCK_DATA = [
  { id: 1, name: "Alpha", secret: "token-alpha-9f2a" },
  { id: 2, name: "Beta", secret: "token-beta-3c7e" },
  { id: 3, name: "Gamma", secret: "token-gamma-1d5b" },
] as const;

/**
 * Example service demonstrating a secured resource.
 * In a real application this would query a database.
 */
@singleton()
export class SecuredResourceService {
  private readonly logger: AppLogger;

  constructor(
    @inject(LoggerFactory) loggerFactory: LoggerFactory
  ) {
    this.logger = loggerFactory.create("SecuredResourceService");
  }

  public getResources(query: SecuredResourceQueryDto): SecuredResourceResponseDto {
    this.logger.debug("getResources called", { filter: query.filter });

    const items = query.filter
      ? MOCK_DATA.filter((r) =>
        r.name.toLowerCase().includes(query.filter!.toLowerCase())
      )
      : [...MOCK_DATA];

    this.logger.info("Returning secured resources", { count: items.length });

    return {
      data: items.map((r) => ({ ...r })),
      meta: {
        total: items.length,
        filter: query.filter,
      },
    };
  }
}

