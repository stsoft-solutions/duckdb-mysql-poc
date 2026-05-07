import { container } from "tsyringe";
import { ConfigurationManager } from "../infratructure/config/configurationManager.js";
import { ExportService } from "../services/exportService";
import { ExportServiceOptionsProvider } from "../services/exportServiceOptions";
import { LoggerOptionsProvider } from "../infratructure/logger/loggerOptions";
import { DbPoolManagerOptionsProvider } from "../infratructure/dbPool/dbPoolManagerOptions";
import { LoggerFactory } from "../infratructure/logger/loggerFactory";
import type { AppLogger } from "../infratructure/logger/appLogger";

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
    // Get all time ranges for the months in 2023 for the 'order_mt4' table based on the 'timestamp' column
    const months = await exportService.getMonthsStatistic('mysql_db.order_mt4', 'time', 'datetime',
      {
        year: 2020,
        month: 1
      },
      {
        year: 2021,
        month: 12
      });

    // Export data for each month
    for (const month of months) {
      await exportService.export('mysql_db.order_mt4', 'time', month.range);
    }
  } catch (error) {
    console.error("Export failed:", error);
    return 1;
  }
  return 0;
}


function setupContainer() {
  // Set up configuration and services.
  const configurationManager = container.resolve<ConfigurationManager>(ConfigurationManager);

  // Add logger options
  configurationManager.addOptions(LoggerOptionsProvider);

  // Database options
  configurationManager.addOptions(DbPoolManagerOptionsProvider);

  // Register ExportServiceOptions
  configurationManager.addOptions(ExportServiceOptionsProvider);


}
