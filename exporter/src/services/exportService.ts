import { inject, injectable } from "tsyringe";
import type { Options } from "@infrastructure/config/Options.js";
import { type ExportServiceOptions, ExportServiceOptionsProvider } from "./exportServiceOptions.js";
import { LoggerFactory } from "@infrastructure/logger/loggerFactory.js";
import type { AppLogger } from "@infrastructure/logger/appLogger.js";
import { DbPoolManager } from "@infrastructure/dbPool/dbPoolManager.js";
import type { Database } from "@infrastructure/dbPool/database.js";
import fs from 'node:fs';
import path from 'node:path';

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

interface MonthStatisticQueryOptions {
  table: string;
  field: string;
  timeExpression: string;
  startBoundaryExpression: string;
  endBoundaryExpression: string;
  timeRepresentation: TimeRepresentation;
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
   * @param {string} tableScheme - The schema of the database table to query.
   * @param {string} field - The name of the field to analyse within the table.
   * @param {TimeRepresentation} timeRepresentation - The time format used for the query (e.g., 'datetime').
   * @param {Month} from - The starting month of the time range.
   * @param {Month} to - The ending month of the time range.
   * @return {Promise<MonthStatistic[]>} A promise that resolves to an array of month statistics.
   */
  public async getMonthsStatistic(table: string, tableScheme: string, field: string, timeRepresentation: TimeRepresentation, from: Month, to: Month): Promise<MonthStatistic[]> {
    let options: MonthStatisticQueryOptions | undefined;

    const fullTable = `${tableScheme}.${table}`;

    switch (timeRepresentation) {
      case TimeRepresentation.datetime:
        options = {
          table: fullTable,
          field,
          timeExpression: field,
          startBoundaryExpression: `make_date(${from.year}, ${from.month}, 1)`,
          endBoundaryExpression: `date_add(make_date(${to.year}, ${to.month}, 1), interval 1 month)`,
          timeRepresentation: TimeRepresentation.datetime
        };
        break;
      case TimeRepresentation.epoch_seconds:
      case TimeRepresentation.epoch_milliseconds: {
        const divider = timeRepresentation === TimeRepresentation.epoch_seconds ? 1 : 1000;
        options = {
          table: fullTable,
          field,
          timeExpression: `TO_TIMESTAMP(${field}/${divider})`,
          startBoundaryExpression: `EPOCH(make_date(${from.year}, ${from.month}, 1))*${divider}`,
          endBoundaryExpression: `EPOCH(make_date(${to.year}, ${to.month}, 1) + interval 1 month)*${divider}`,
          timeRepresentation
        };
        break;
      }
    }

    return options ? await this.getMonthsStatisticInternal(options) : [];
  }

  public async export(table: string, tableScheme: string, field: string, monthStat: MonthStatistic) {
    this.logger.info(`Exporting data for table ${tableScheme}.${table} with field ${field} and time range ${monthStat.range.start} - ${monthStat.range.end} (${monthStat.range.timeRepresentation})...`);

    // Create folders (temp and storage) at file system
    this.prepareStorage(table, monthStat);

    // Extract the month from the month from the source table
    if (monthStat.range.timeRepresentation === TimeRepresentation.datetime) {
      await this.extractDataToTempFiles<Date>(tableScheme, table,  field, monthStat);
    } else {
      await this.extractDataToTempFiles<bigint>(tableScheme, table, field, monthStat);
    }

    // Consolidate the data into a single file in the storage folder
    await this.consolidateTempFiles(table, monthStat.month);

    // Clear temp files

  }

  private async extractDataToTempFiles<T extends bigint | Date>(tableSchema: string, table: string, field: string, monthStat: MonthStatistic) {
    let chunkNumber = 0;
    const chunkSize = this.options.chunkSize;
    const monthPath = this.buildTempPath(table, monthStat.month);
    const fullTableName = `${tableSchema}.${table}`;

    let lastTs: T = (typeof monthStat.range.start === 'bigint'
      ? monthStat.range.start - 1n
      : new Date(monthStat.range.start.getTime() - 1)) as T;

    const maxTs = monthStat.range.end;

    while (lastTs < monthStat.range.end) {
      // Use a unique filename for each batch to avoid overwriting
      const chunkFilename = `${table}_chunk${chunkNumber}_{i}`;

      // Get last timestamp for current batch
      const chunkLastTsSql = `
                    SELECT max(a.${field}) AS chunk_last_ts
                    FROM (SELECT s.${field}
                          FROM ${fullTableName} AS s
                          WHERE s.${field} > ?
                            AND s.${field} <= ?
                          ORDER BY s.${field}
                          LIMIT ${chunkSize}) AS a;
                `;

      const s = await this.db.queryRaw(chunkLastTsSql, [lastTs, maxTs]);
      const rows = await this.db.query<{ chunk_last_ts: T }>(chunkLastTsSql, [lastTs, maxTs]);
      const chunkLastTs: T = rows[0].chunk_last_ts;

      if (lastTs >= chunkLastTs) {
        break;
      }

      // Use cursor-based pagination: WHERE timestamp > lastTimestamp
      const copySql = `
                COPY (
                  SELECT s.*
                  FROM ${fullTableName} s
                  WHERE s.${field} > ? 
                    AND s.${field} <= ? 
                )
                TO '${monthPath}'
                (FORMAT PARQUET,
                 COMPRESSION ZSTD,
                 FILE_SIZE_BYTES ?,
                 OVERWRITE_OR_IGNORE true,
                 FILENAME_PATTERN '${chunkFilename}');
              `;
      await this.db.execute(copySql, [lastTs, chunkLastTs, this.options.maxFileSize]);

      // Switch to the next batch
      lastTs = chunkLastTs;
      chunkNumber++;
    }
  }

  private buildStoragePath(table: string, month: Month) {
    return path.join(this.options.storagePath, table, month.year.toString(), month.month.toString());
  }

  private async consolidateTempFiles(table: string, month: Month) {
    const tempFolder = this.buildTempPath(table, month);
    const storageFolder = this.buildStoragePath(table, month);
  }

  private buildTempPath(table: string, month: Month) {
    return path.join(this.options.tempPath, table, month.year.toString(), month.month.toString());
  }

  private prepareStorage(table: string, monthStat: MonthStatistic) {
    // Create storage folder for the month if it doesn't exist
    fs.mkdirSync(this.buildStoragePath(table, monthStat.month), { recursive: true });

    // Create (if not exists) end clear temp folder for the month
    const tempFolder = this.buildTempPath(table, monthStat.month);
    if (fs.existsSync(tempFolder)) {
      fs.rmSync(tempFolder, { recursive: true, force: true });
    }
    fs.mkdirSync(tempFolder, { recursive: true });
  }


  /**
   * Retrieves monthly statistics based on the provided query options, such as time expressions, table, and boundaries.
   * Processes data to group by year and month while calculating record counts and range values.
   *
   * @param {MonthStatisticQueryOptions} options - The query options, including time expression, field, table, and boundary expressions.
   * @return {Promise<MonthStatistic[]>} A promise resolving to an array of monthly statistics, each including year, month, count, and value range.
   */
  private async getMonthsStatisticInternal<T extends Date | bigint>(options: MonthStatisticQueryOptions): Promise<MonthStatistic[]> {
    const sql = `
SELECT DATE_PART('year', ${options.timeExpression}) AS year,
       DATE_PART('month', ${options.timeExpression}) AS month,
       MIN(${options.field}) AS minimum_ts,
       MAX(${options.field}) AS maximum_ts,
       COUNT(*) AS count
FROM ${options.table}
WHERE ${options.field} >= ${options.startBoundaryExpression}
AND ${options.field} < ${options.endBoundaryExpression}
GROUP BY year, month
ORDER BY year, month
`;

    const result = await this.db.query<{
      year: number,
      month: number,
      minimum_ts: T,
      maximum_ts: T,
      count: number
    }>(sql);

    return result.map(row => ({
      month: { year: row.year, month: row.month },
      count: row.count,
      range: {
        timeRepresentation: options.timeRepresentation,
        start: row.minimum_ts,
        end: row.maximum_ts
      }
    }));
  }

  private formatDateForDuckDB(date: Date): string {
    const iso = date.toISOString();
    // Convert: 2019-12-31T23:59:59.999Z -> 2019-12-31 23:59:59.999000
    const [datePart, timePart] = iso.split('T');
    const timeWithoutZ = timePart.replace('Z', '');
    const [time, ms] = timeWithoutZ.split('.');
    // Pad milliseconds to microseconds: .999 -> .999000
    const us = ms.padEnd(6, '0');
    return `${datePart} ${time}.${us}`;
  }
}
