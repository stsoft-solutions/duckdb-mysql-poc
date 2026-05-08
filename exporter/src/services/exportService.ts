import { inject, injectable } from "tsyringe";
import { Options } from "../infratructure/config/Options.js";
import { ExportServiceOptions, ExportServiceOptionsProvider } from "./exportServiceOptions.js";
import { LoggerFactory } from "../infratructure/logger/loggerFactory.js";
import { AppLogger } from "../infratructure/logger/appLogger.js";
import { DbPoolManager } from "../infratructure/dbPool/dbPoolManager.js";
import { Database } from "../infratructure/dbPool/database.js";

export interface TimeRange {
  start: Date | bigint;
  end: Date | bigint;
  timeRepresentation: TimeRepresentation;
}

export enum TimeRepresentation {
  'datetime' = 'datetime',
  'epoch_seconds' = 'epoch-seconds',
  'epoch_milliseconds' = 'epoch-milliseconds'
}

export interface Month {
  year: number;
  month: number;
}

export interface MonthStatistic {
  month: Month;
  count: number;
  range: TimeRange;
}

@injectable()
export class ExportService {
  private readonly options: ExportServiceOptions;
  private logger: AppLogger;
  private db: Database;

  constructor(
    @inject(ExportServiceOptionsProvider.OptionsToken) options: Options<ExportServiceOptions>,
    @inject(DbPoolManager) dbPoolManager: DbPoolManager,
    @inject(LoggerFactory) loggerFactory: LoggerFactory
  ) {
    this.logger = loggerFactory.create(ExportService);
    this.options = options.value;
    this.db = dbPoolManager.getDatabase(this.options.dbConnection);
  }

  /**
   * Retrieves statistics for each month within a specified time range.
   *
   * @param {string} table - The name of the database table to query.
   * @param {string} field - The name of the field to analyse within the table.
   * @param {TimeRepresentation} timeRepresentation - The time format used for the query (e.g., 'datetime').
   * @param {Month} from - The starting month of the time range.
   * @param {Month} to - The ending month of the time range.
   * @return {Promise<MonthStatistic[]>} A promise that resolves to an array of month statistics.
   */
  public async getMonthsStatistic(table: string, field: string, timeRepresentation: TimeRepresentation, from: Month, to: Month): Promise<MonthStatistic[]> {
    if (timeRepresentation === 'datetime') {
      return await this.getDateTimeMonthsStatistic(table, field, from, to);
    } else if (timeRepresentation === 'epoch-seconds') {
      return await this.getTimestampMonthsStatistic(table, field, 1, from, to);
    } else if (timeRepresentation === 'epoch-milliseconds') {
      return await this.getTimestampMonthsStatistic(table, field, 1000, from, to);
    }
    return [];
  }

  public async export(table: string, field: string, timeRange: TimeRange) {
    this.logger.info(`Exporting data from ${table} where ${field} between ${this.formatRangeValue(timeRange.start)} and ${this.formatRangeValue(timeRange.end)} (format: ${timeRange.timeRepresentation})`);
  }

  private formatRangeValue(value: Date | BigInt): string {
    return value instanceof Date ? value.toISOString() : value.toString();
  }

  /**
   * Fetches statistical data grouped by year and month from a specified database table and field.
   *
   * @param {string} table - The name of the database table to query.
   * @param {string} field - The field in the table to analyze for date/month statistics.
   * @param {Month} from - The starting month and year for the statistics range.
   * @param {Month} to - The ending month and year for the statistics range.
   * @return {Promise<MonthStatistic[]>} A promise that resolves to an array of month statistics,
   * including the year, month, count of records, and a range of datetime values.
   */
  private async getDateTimeMonthsStatistic(table: string, field: string, from: Month, to: Month): Promise<MonthStatistic[]> {
    const sql = `
SELECT DATE_PART('year', ${field}) AS year,
       DATE_PART('month', ${field}) AS month,
       MIN(${field}) AS first_record,
       MAX(${field}) AS last_record,
       COUNT(*) AS count
FROM ${table}
WHERE ${field} >= make_date(${from.year}, ${from.month}, 1)
AND ${field} < date_add(make_date(${to.year}, ${to.month}, 1), interval 1 month)
GROUP BY year, month
ORDER BY year, month
`;

    const result = await this.db.query<{
      year: number,
      month: number,
      first_record: Date,
      last_record: Date,
      count: number
    }>(sql);

    return result.map(row => ({
      month: { year: row.year, month: row.month },
      count: row.count,
      range: {
        timeRepresentation: TimeRepresentation.datetime,
        start: row.first_record,
        end: row.last_record
      }
    }));
  }

  /**
   * Retrieves monthly statistics from a specified database table based on a timestamp field.
   *
   * @param {string} table - The name of the database table to query.
   * @param {string} field - The name of the field containing the timestamp values.
   * @param {number} divider - The value to divide the timestamp field by (e.g., 1000 to convert milliseconds to seconds).
   * @param {Month} from - The starting month and year of the range for the query.
   * @param {Month} to - The ending month and year of the range for the query.
   * @return {Promise<MonthStatistic[]>} A promise that resolves to an array of month statistics. Each statistic includes the year, month, count of records, and the range of timestamp values.
   */
  private async getTimestampMonthsStatistic(table: string, field: string, divider: number, from: Month, to: Month): Promise<MonthStatistic[]> {
    const sql = `
SELECT DATE_PART('year', TO_TIMESTAMP(${field}/${divider})) AS year,
       DATE_PART('month', TO_TIMESTAMP(${field}/${divider})) AS month,
       MIN(${field}) AS first_record,
       MAX(${field}) AS last_record,
       COUNT(*) AS count
FROM ${table}
WHERE ${field} >= EPOCH(make_date(${from.year}, ${from.month}, 1))*${divider}
AND ${field} < EPOCH(make_date(${to.year}, ${to.month}, 1) + interval 1 month)*${divider}
GROUP BY year, month
ORDER BY year, month
`;

    const result = await this.db.query<{
      year: number,
      month: number,
      first_record: bigint,
      last_record: bigint,
      count: number
    }>(sql);

    return result.map(row => ({
      month: { year: row.year, month: row.month },
      count: row.count,
      range: {
        timeRepresentation: divider === 1 ? TimeRepresentation.epoch_seconds : TimeRepresentation.epoch_milliseconds,
        start: row.first_record,
        end: row.last_record
      }
    }));

  }
}
