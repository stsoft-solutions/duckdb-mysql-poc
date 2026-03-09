import {inject, injectable} from "tsyringe";
import {Options} from "../infratructure/config/Options";
import { ExportServiceOptions, ExportServiceOptionsProvider } from "./exportServiceOptions";

@injectable()
export class ExportService {
  private readonly options: ExportServiceOptions;

  constructor(@inject(ExportServiceOptionsProvider.OptionsToken) options: Options<ExportServiceOptions>) {
    this.options = options.value;
  }

  async export() {
    //
  }
}
