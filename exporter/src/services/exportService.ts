import { inject, injectable } from "tsyringe";
import { Options } from "../infratructure/config/Options";
import { ExportServiceOptions, ExportServiceOptionsProvider } from "./exportServiceOptions";
import { LoggerFactory } from "../infratructure/logger/loggerFactory";
import { AppLogger } from "../infratructure/logger/appLogger";
import { DbPoolManager } from "../infratructure/dbPool/dbPoolManager";
import { IDatabase } from "../infratructure/dbPool/IDatabase";

export interface TimeRange {
  start: Date | bigint;
  end: Date | bigint;
  format: TimeRangeFormat;
}

export type TimeRangeFormat = 'datetime' | 'epoch-seconds' | 'epoch-milliseconds';

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
  private db: IDatabase;

  constructor(
    @inject(ExportServiceOptionsProvider.OptionsToken) options: Options<ExportServiceOptions>,
    @inject(DbPoolManager) dbPoolManager: DbPoolManager,
    @inject(LoggerFactory) loggerFactory: LoggerFactory
  ) {
    this.db = dbPoolManager.getDatabase('processing');
    this.options = options.value;
    this.logger = loggerFactory.create(ExportService);
  }

  public async getMonthsStatistic(table: string, field: string, format: TimeRangeFormat, from: Month, to: Month): Promise<MonthStatistic[]> {
    let sql = '';
    if (format === 'datetime') {
      return await this.getDateTimeMonthsStatistic(table, field, from, to);
    }

    return [];
  }

  private formatRangeValue(value: Date | BigInt): string {
    return value instanceof Date ? value.toISOString() : value.toString();
  }

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
        format: 'datetime',
        start: row.first_record,
        end: row.last_record
      }
    }));
  }


  public async export(table: string, field: string, timeRange: TimeRange) {
    this.logger.info(`Exporting data from ${table} where ${field} between ${this.formatRangeValue(timeRange.start)} and ${this.formatRangeValue(timeRange.end)} (format: ${timeRange.format})`);
  }
}
