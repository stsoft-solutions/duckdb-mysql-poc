import {
  type AppLogger,
  ConfigurationManager,
  DbPoolManagerOptionsProvider,
  LoggerFactory,
  LoggerOptionsProvider,
  type Options,
  registerDbPool
} from "@duckdb-poc/shared-infra";
import { container } from "tsyringe";
import { ExportService, TimeRepresentation } from "../services/exportService.js";
import { ExportServiceOptionsProvider } from "../services/exportServiceOptions.js";
import { performance } from "node:perf_hooks";
import { type AppOptions, AppOptionsProvider } from "./AppOptions.js";

/**
 * Entry point for the command-line interface.
 *
 * @param {string[]} argv - The array of command-line arguments passed to the program.
 * @return {Promise<number>} A promise that resolves to the program's exit code.
 */
export async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("Usage: cli [--help]");
    return 0;
  }

  // Set up configuration and services.
  const configurationManager = new ConfigurationManager(container);

  configurationManager.addOptionsMany([
    LoggerOptionsProvider,
    DbPoolManagerOptionsProvider,
    ExportServiceOptionsProvider,
    AppOptionsProvider
  ]);

  registerDbPool(container);

  const logger: AppLogger = container.resolve(LoggerFactory).create('main');
  const exportService = container.resolve(ExportService);

  logger.info("Starting exporter...");
  const startedAt = performance.now();

  // Get AppOptions and process them
  const options = container.resolve<Options<AppOptions>>(AppOptionsProvider.OptionsToken).value;

  // Process the tables' array
  for (const table of options.tables) {
    try {
      await handleTable(table, options, logger, exportService);
    } catch (e) {
      logger.error(e, "Error processing table");
    }
  }

  return 0;
}

function formatRangeValue(value: Date | BigInt): string {
  return value instanceof Date ? value.toISOString() : value.toString();
}

async function handleTable(table: {
                             tableName: string;
                             fieldName: string;
                             timeRepresentation: TimeRepresentation;
                           }, options: AppOptions,
                           logger: AppLogger,
                           exportService: ExportService) {

  logger.info(`Processing table: ${table.tableName}`);

  // Load statistics for the specified time range and export data for each month
  const monthlyStatisticsDatetime = await exportService.getMonthsStatistic(
    table.tableName, options.schemaName, table.fieldName, table.timeRepresentation,
    {
      year: options.from.year,
      month: options.from.month
    },
    {
      year: options.to.year,
      month: options.to.month
    }
  );

  logger.info(`Loaded month statistics for ${table.tableName}`, {
    from: `${options.from.year}-${options.from.month}`,
    to: `${options.to.year}-${options.to.month}`,
    months: monthlyStatisticsDatetime.length
  });

  // Export data for each month
  for (const month of monthlyStatisticsDatetime) {
    logger.info(`Exporting data for month ${month.month.year}-${month.month.month} with range ${formatRangeValue(month.range.start)} - ${formatRangeValue(month.range.end)}. Records: ${month.count}`);
    await exportService.export(table.tableName, options.schemaName, table.fieldName, month);
  }
}