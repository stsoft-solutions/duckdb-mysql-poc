import { container } from "tsyringe";
import { ConfigurationManager } from "@infrastructure/config/configurationManager.js";
import { ExportService, TimeRepresentation } from "../services/exportService.js";
import { ExportServiceOptionsProvider } from "../services/exportServiceOptions.js";
import { LoggerOptionsProvider } from "@infrastructure/logger/loggerOptions.js";
import { DbPoolManagerOptionsProvider } from "@infrastructure/dbPool/dbPoolManagerOptions.js";
import { LoggerFactory } from "@infrastructure/logger/loggerFactory.js";
import type { AppLogger } from "@infrastructure/logger/appLogger.js";

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
  // Initialise the container and register dependencies.
  setupContainer();

  const logger: AppLogger = container.resolve(LoggerFactory).create('Main');
  const exportService = container.resolve(ExportService);

  logger.info("Starting exporter...");

  try {
    // Get all time ranges for the monthlyStatistics in 2023 for the 'order_mt4' table based on the 'timestamp' column
    const monthlyStatisticsDatetime = await exportService.getMonthsStatistic('mysql_db.order_mt4', 'time', TimeRepresentation.datetime,
      {
        year: 2020,
        month: 1
      },
      {
        year: 2021,
        month: 12
      });

    // Export data for each month
    for (const month of monthlyStatisticsDatetime) {
      await exportService.export('mysql_db.order_mt4', 'time', month.range);
    }

    // Get all time ranges for the monthlyStatistics in 2023 for the 'order_mt4' table based on the 'timestamp' column
    const monthlyStatisticsEpoch = await exportService.getMonthsStatistic('mysql_db.order_mt5', 'time', TimeRepresentation.epoch_seconds,
      {
        year: 2020,
        month: 1
      },
      {
        year: 2021,
        month: 12
      });

    // Export data for each month
    for (const month of monthlyStatisticsEpoch) {
      await exportService.export('mysql_db.order_mt5', 'time', month.range);
    }

  } catch (err) {
    logger.error({ err }, `An error occurred during export: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  return 0;
}


function setupContainer() {
  // Set up configuration and services.
  const configurationManager = container.resolve<ConfigurationManager>(ConfigurationManager);

  configurationManager.addOptionsMany([
    LoggerOptionsProvider,
    DbPoolManagerOptionsProvider,
    ExportServiceOptionsProvider
  ]);
}
