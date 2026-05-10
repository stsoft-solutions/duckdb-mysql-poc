import {
  type AppLogger,
  ConfigurationManager,
  DbPoolManagerOptionsProvider,
  LoggerFactory,
  LoggerOptionsProvider,
  container
} from "@duckdb-poc/shared-infra";
import { ExportService, TimeRepresentation } from "../services/exportService.js";
import { ExportServiceOptionsProvider } from "../services/exportServiceOptions.js";
import { performance } from "node:perf_hooks";

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
  const configurationManager = container.resolve<ConfigurationManager>(ConfigurationManager);

  configurationManager.addOptionsMany([
    LoggerOptionsProvider,
    DbPoolManagerOptionsProvider,
    ExportServiceOptionsProvider
  ]);

  const logger: AppLogger = container.resolve(LoggerFactory).create('main');
  const exportService = container.resolve(ExportService);

  logger.info("Starting exporter...");
  const startedAt = performance.now();

  const tableScheme = 'mysql_db';

  try {
    const mt4StatsStartedAt = performance.now();
    // Get all time ranges for the monthlyStatistics in 2023 for the 'order_mt4' table based on the 'timestamp' column
    const monthlyStatisticsDatetime = await exportService.getMonthsStatistic('order_mt4', tableScheme, 'time', TimeRepresentation.datetime,
      {
        year: 2020,
        month: 1
      },
      {
        year: 2025,
        month: 12
      });
    logger.info('Loaded month statistics', {
      table: 'order_mt4',
      months: monthlyStatisticsDatetime.length,
      elapsedMs: Math.round(performance.now() - mt4StatsStartedAt)
    });

    // Export data for each month
    for (const month of monthlyStatisticsDatetime) {
      logger.info(`Exporting data for month ${month.month.year}-${month.month.month} with range ${formatRangeValue(month.range.start)} - ${formatRangeValue(month.range.end)}. Records: ${month.count}`);
      await exportService.export('order_mt4', tableScheme, 'time', month);
    }

    const mt5StatsStartedAt = performance.now();
    // Get all time ranges for the monthlyStatistics in 2023 for the 'order_mt4' table based on the 'timestamp' column
    const monthlyStatisticsEpoch = await exportService.getMonthsStatistic('order_mt5', tableScheme, 'time', TimeRepresentation.epoch_seconds,
      {
        year: 2020,
        month: 1
      },
      {
        year: 2025,
        month: 12
      });
    logger.info('Loaded month statistics', {
      table: 'order_mt5',
      months: monthlyStatisticsEpoch.length,
      elapsedMs: Math.round(performance.now() - mt5StatsStartedAt)
    });

    // Export data for each month
    for (const month of monthlyStatisticsEpoch) {
      logger.info(`Exporting data for month ${month.month.year}-${month.month.month} with range ${formatRangeValue(month.range.start)} - ${formatRangeValue(month.range.end)}. Records: ${month.count}`);
      await exportService.export('order_mt5', tableScheme, 'time', month);
    }

    const mt6StatsStartedAt = performance.now();
    // Get all time ranges for the monthlyStatistics in 2023 for the 'order_mt4' table based on the 'timestamp' column
    const monthlyStatisticsDateTime = await exportService.getMonthsStatistic('order_mt6', tableScheme, 'time', TimeRepresentation.datetime,
      {
        year: 2020,
        month: 1
      },
      {
        year: 2025,
        month: 12
      });
    logger.info('Loaded month statistics', {
      table: 'order_mt6',
      months: monthlyStatisticsDateTime.length,
      elapsedMs: Math.round(performance.now() - mt6StatsStartedAt)
    });

    // Export data for each month
    for (const month of monthlyStatisticsDateTime) {
      logger.info(`Exporting data for month ${month.month.year}-${month.month.month} with range ${formatRangeValue(month.range.start)} - ${formatRangeValue(month.range.end)}. Records: ${month.count}`);
      await exportService.export('order_mt6', tableScheme, 'time', month);
    }

    logger.info('Exporter finished successfully', {
      elapsedMs: Math.round(performance.now() - startedAt)
    });

  } catch (err: unknown) {
    logger.error(err, "An error occurred during export");
    return 1;
  }
  return 0;
}

function formatRangeValue(value: Date | BigInt): string {
  return value instanceof Date ? value.toISOString() : value.toString();
}
