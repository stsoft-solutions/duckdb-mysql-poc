import { inject, injectable } from "tsyringe";
import { Options } from "../infratructure/config/Options";
import { ExportServiceOptions, ExportServiceOptionsProvider } from "./exportServiceOptions";
import { LoggerAccessor } from "../infratructure/logger/loggerAccessor";
import { AppLogger } from "../infratructure/logger/appLogger";
import { DbPoolManager } from "../infratructure/dbPool/dbPoolManager";

interface TimeRange {
  start: Date | BigInt;
  end: Date | BigInt;
  format: 'datetime' | 'epoch-seconds' | 'epoch-milliseconds';
}

export interface Month {
  year: number;
  month: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
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

  constructor(
    @inject(ExportServiceOptionsProvider.OptionsToken) options: Options<ExportServiceOptions>,
    @inject(DbPoolManager) private dbPoolManager: DbPoolManager,
    @inject(LoggerAccessor) loggerAccessor: LoggerAccessor
  ) {
    this.options = options.value;
    this.logger = loggerAccessor.getLogger();
  }

  public async getStatisticByMonths(table: string, from: Month, to: Month): Promise<MonthStatistic[]> {
    return [];
  }

  public async export(table: string, timeRange: TimeRange) {
    this.logger.error("exportService.exportService");
  }
}
