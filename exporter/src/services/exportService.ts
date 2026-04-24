import {inject, injectable} from "tsyringe";
import {Options} from "../infratructure/config/Options";
import { ExportServiceOptions, ExportServiceOptionsProvider } from "./exportServiceOptions";
import { LoggerAccessor } from "../infratructure/logger/loggerAccessor";
import { AppLogger } from "../infratructure/logger/appLogger";

@injectable()
export class ExportService {
  private readonly options: ExportServiceOptions;
  private logger: AppLogger;

  constructor(@inject(ExportServiceOptionsProvider.OptionsToken) options: Options<ExportServiceOptions>, @inject(LoggerAccessor) loggerAccessor: LoggerAccessor) {
    this.options = options.value;
    this.logger = loggerAccessor.getLogger();
  }



  async export() {
    this.logger.error("exportService.exportService");
  }
}
