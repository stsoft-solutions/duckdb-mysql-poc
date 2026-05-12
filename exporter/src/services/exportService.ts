import { type AppLogger, type Database, DbPoolManager, LoggerFactory, type Options } from "@duckdb-poc/shared-infra";
import { inject, injectable } from "tsyringe";
import { type ExportServiceOptions, ExportServiceOptionsProvider } from "./exportServiceOptions.js";
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

export interface TimeRange {
  start: Date | bigint;
  end: Date | bigint;
  timeRepresentation: TimeRepresentation;
}

export enum TimeRepresentation {
  'datetime' = 'datetime',
  'epoch' = 'epoch',
  'epoch_ms' = 'epoch_ms'
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
      case TimeRepresentation.epoch:
      case TimeRepresentation.epoch_ms:
        const multiplier = timeRepresentation === TimeRepresentation.epoch ? 1 : 1000;

        // Pre-compute boundary values in JS as plain integer literals.
        // DuckDB-specific functions like EPOCH() cannot be pushed down to MySQL,
        // causing a full table scan. Plain integer literals ARE pushed down,
        // allowing MySQL to use the index on 'time'.
        const startMs = Date.UTC(from.year, from.month - 1, 1);
        const endDate = new Date(Date.UTC(to.year, to.month - 1, 1));
        endDate.setUTCMonth(endDate.getUTCMonth() + 1);
        const endMs = endDate.getTime();

        const startBound = BigInt(startMs / 1000) * BigInt(multiplier);
        const endBound = BigInt(endMs / 1000) * BigInt(multiplier);

        options = {
          table: fullTable,
          field,
          timeExpression: `TO_TIMESTAMP(${field}/${multiplier})`,
          startBoundaryExpression: startBound.toString(),
          endBoundaryExpression: endBound.toString(),
          timeRepresentation
        };
        break;
    }

    return options ? await this.getMonthsStatisticInternal(options) : [];
  }

  public async export(table: string, tableScheme: string, field: string, monthStat: MonthStatistic) {
    const startedAt = performance.now();
    this.logger.debug('Starting month export', {
      table,
      tableScheme,
      field,
      month: `${monthStat.month.year}-${monthStat.month.month}`,
      rangeStart: this.formatRangeValue(monthStat.range.start),
      rangeEnd: this.formatRangeValue(monthStat.range.end),
      timeRepresentation: monthStat.range.timeRepresentation,
      records: monthStat.count
    });

    // Create folders (temp and storage) at file system
    this.prepareStorage(table, monthStat);

    // Extract the month from the month from the source table
    if (monthStat.range.timeRepresentation === TimeRepresentation.datetime) {
      await this.extractDataToTempFiles<Date>(tableScheme, table, field, monthStat);
    } else {
      await this.extractDataToTempFiles<bigint>(tableScheme, table, field, monthStat);
    }

    // Consolidate the data into a single file in the storage folder
    await this.consolidateTempFiles(table, field, monthStat.month);

    this.logger.debug('Finished month export', {
      table,
      month: `${monthStat.month.year}-${monthStat.month.month}`,
      elapsedMs: Math.round(performance.now() - startedAt)
    });

    // Clear temp files

  }

  /**
   * Extracts data from a database table to temporary files in chunks.
   * This method paginates through a specified range of data using a field and writes the data to Parquet files
   * in chunks for efficient storage and processing.
   *
   * @param {string} tableSchema - The schema of the table from which data is extracted.
   * @param {string} table - The name of the table from which data is extracted.
   * @param {string} field - The field used as the boundary for pagination, typically a timestamp or an incremental key.
   * @param {MonthStatistic} monthStat - An object containing statistics about the monthly data to extract, including the range and count of records.
   * @returns {Promise<void>} A promise that resolves when the data extraction process completes.
   */
  private async extractDataToTempFiles<T extends bigint | Date>(tableSchema: string, table: string, field: string, monthStat: MonthStatistic): Promise<void> {
    let chunkNumber = 0;
    const chunkSize = this.options.chunkSize;
    const monthPath = this.buildTempPath(table, monthStat.month);
    const fullTableName = `${tableSchema}.${table}`;
    const extractStartedAt = performance.now();

    let lastTs: T = (typeof monthStat.range.start === 'bigint'
      ? monthStat.range.start - 1n
      : new Date(monthStat.range.start.getTime() - 1)) as T;

    const maxTs = monthStat.range.end;
    const isSingleChunkMonth = monthStat.count <= chunkSize;

    while (lastTs < monthStat.range.end) {
      const chunkStartedAt = performance.now();
      const currentChunk = chunkNumber;

      // Use a unique filename for each batch to avoid overwriting
      const chunkFilename = `${table}_chunk${chunkNumber}_{i}`;

      let chunkLastTs: T;
      if (isSingleChunkMonth) {
        chunkLastTs = maxTs as T;
        this.logger.debug('Skipping chunk upper-bound query because month fits in a single chunk', {
          table,
          chunkNumber: currentChunk,
          monthCount: monthStat.count,
          chunkSize
        });
      } else {
        this.logger.debug('Resolving chunk upper bound', {
          table,
          chunkNumber: currentChunk,
          lowerBoundExclusive: this.formatRangeValue(lastTs),
          upperBoundInclusive: this.formatRangeValue(maxTs)
        });

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

        const chunkBoundStartedAt = performance.now();

        const rows = await this.db.query<{ chunk_last_ts: T }>(chunkLastTsSql, [lastTs, maxTs]);
        this.logger.debug('Resolved chunk upper bound', {
          table,
          chunkNumber: currentChunk,
          elapsedMs: Math.round(performance.now() - chunkBoundStartedAt),
          rows: rows.length
        });

        if (rows.length === 0 || rows[0]?.chunk_last_ts === null || rows[0]?.chunk_last_ts === undefined) {
          this.logger.info('No more rows in current range; stopping chunk loop', {
            table,
            chunkNumber: currentChunk,
            lowerBoundExclusive: this.formatRangeValue(lastTs),
            upperBoundInclusive: this.formatRangeValue(maxTs)
          });
          break;
        }

        chunkLastTs = rows[0].chunk_last_ts;
      }

      if (lastTs >= chunkLastTs) {
        this.logger.warn('Chunk upper bound did not advance; stopping chunk loop to avoid infinite iteration', {
          table,
          chunkNumber: currentChunk,
          lastTs: this.formatRangeValue(lastTs),
          chunkLastTs: this.formatRangeValue(chunkLastTs)
        });
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
      const copyStartedAt = performance.now();

      await this.db.execute(copySql, [lastTs, chunkLastTs, this.options.maxFileSize]);
      this.logger.debug('Chunk exported', {
        table,
        chunkNumber: currentChunk,
        lowerBoundExclusive: this.formatRangeValue(lastTs),
        upperBoundInclusive: this.formatRangeValue(chunkLastTs),
        chunkElapsedMs: Math.round(performance.now() - chunkStartedAt),
        copyElapsedMs: Math.round(performance.now() - copyStartedAt)
      });

      // Switch to the next batch
      lastTs = chunkLastTs;
      chunkNumber++;
    }

    this.logger.info('Finished data extraction to temp files', {
      table,
      month: `${monthStat.month.year}-${monthStat.month.month}`,
      chunks: chunkNumber,
      elapsedMs: Math.round(performance.now() - extractStartedAt)
    });
  }

  private buildStoragePath(table: string, month: Month) {
    return path.join(
      this.options.storagePath,
      table,
      `year=${month.year}`,
      `month=${month.month}`
    );
  }

  /**
   * Consolidates temporary parquet files from a specified temporary folder into a storage folder,
   * merging them into a clean, deterministic format and ordered by the given field.
   * Removes temporary files and folders after successful consolidation.
   *
   * @param {string} table - The name of the table associated with the parquet files.
   * @param {string} field - The field used for ordering the parquet file contents.
   * @param {Month} month - The month object containing the year and month associated with the files.
   * @return {Promise<void>} Resolves once the consolidation process is complete.
   */
  private async consolidateTempFiles(table: string, field: string, month: Month): Promise<void> {
    const tempFolder = this.buildTempPath(table, month);
    const storageFolder = this.buildStoragePath(table, month);
    const startedAt = performance.now();

    if (!fs.existsSync(tempFolder)) {
      this.logger.warn('Temp folder does not exist; skipping consolidation', {
        table,
        month: `${month.year}-${month.month}`,
        tempPath: tempFolder
      });
      return;
    }

    const tempFiles = fs.readdirSync(tempFolder).filter(entry => entry.endsWith('.parquet'));
    if (tempFiles.length === 0) {
      this.logger.warn('No parquet chunks found in temp folder; skipping consolidation', {
        table,
        month: `${month.year}-${month.month}`,
        tempPath: tempFolder
      });

      fs.rmSync(tempFolder, { recursive: true, force: true });

      this.logger.debug('Removed empty temp folder after consolidation skip', {
        table,
        month: `${month.year}-${month.month}`,
        tempPath: tempFolder
      });
      return;
    }

    // Rebuild the destination month folder so the consolidated output is clean and deterministic.
    fs.rmSync(storageFolder, { recursive: true, force: true });
    fs.mkdirSync(storageFolder, { recursive: true });

    const tempPattern = path.join(tempFolder, '**', '*.parquet').replace(/\\/g, '/');
    const consolidatedFilenamePattern = `${table}_${month.year}_${month.month}_{i}`;

    this.logger.debug('Consolidating temp parquet files', {
      table,
      month: `${month.year}-${month.month}`,
      tempPath: tempFolder,
      storagePath: storageFolder,
      parquetFiles: tempFiles.length,
      pattern: tempPattern
    });

    const consolidateSql = `
      COPY (
        SELECT *
        FROM read_parquet('${tempPattern}')
        ORDER BY ${field}
      )
      TO '${storageFolder}'
      (FORMAT PARQUET,
       COMPRESSION ZSTD,
       FILE_SIZE_BYTES '${this.options.maxFileSize}',
       FILENAME_PATTERN '${consolidatedFilenamePattern}');
    `;

    await this.db.execute(consolidateSql);

    // Clean up temporary chunk data once the consolidated output is written.
    fs.rmSync(tempFolder, { recursive: true, force: true });

    this.logger.info('Temp files consolidated', {
      table,
      month: `${month.year}-${month.month}`,
      tempFiles: tempFiles.length,
      storagePath: storageFolder,
      elapsedMs: Math.round(performance.now() - startedAt)
    });
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
    const startedAt = performance.now();
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
      count: number | bigint
    }>(sql);

    const totalRecords = result.reduce<bigint>((sum, row) => sum + this.toBigIntCount(row.count), 0n);

    this.logger.info('Computed month statistics', {
      table: options.table,
      field: options.field,
      timeRepresentation: options.timeRepresentation,
      months: result.length,
      totalRecords: totalRecords.toString(),
      elapsedMs: Math.round(performance.now() - startedAt)
    });

    return result.map(row => ({
      month: { year: row.year, month: row.month },
      count: this.toNumberCount(row.count),
      range: {
        timeRepresentation: options.timeRepresentation,
        start: row.minimum_ts,
        end: row.maximum_ts
      }
    }));
  }


  private formatRangeValue(value: Date | bigint): string {
    return value instanceof Date ? value.toISOString() : value.toString();
  }

  private toBigIntCount(value: number | bigint): bigint {
    return typeof value === 'bigint' ? value : BigInt(value);
  }

  private toNumberCount(value: number | bigint): number {
    if (typeof value === 'number') {
      return value;
    }

    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      this.logger.warn('COUNT(*) exceeded Number.MAX_SAFE_INTEGER; count is truncated to number precision', {
        count: value.toString()
      });
    }

    return Number(value);
  }
}

