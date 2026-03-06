import { inject, injectable } from "tsyringe";
import { z } from "zod";
import { IOptions } from "../infratructure/config/IOptions.js";

const DbConnectionOptionsSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  username: z.string().min(1),
  password: z.string().min(1),
  database: z.string().min(1)
}).strict();

const ExportServiceOptionsSchema = z.object({
  db_connection: DbConnectionOptionsSchema
}).strict();

type DbConnectionOptions = z.infer<typeof DbConnectionOptionsSchema>;

export class ExportServiceOptions {
  public static readonly OptionsToken: string = "ExportServiceOptions";
  public static readonly SectionName: string = "export_service";

  public DbConnection: DbConnectionOptions;

  constructor(dbConnection: DbConnectionOptions) {
    this.DbConnection = dbConnection;
  }

  public static hydrate(raw: unknown): ExportServiceOptions {
    const parsed = ExportServiceOptionsSchema.parse(raw ?? {});
    return new ExportServiceOptions(parsed.db_connection);
  }

  public static validate(options: ExportServiceOptions): void {
    ExportServiceOptionsSchema.parse({ db_connection: options.DbConnection });
  }
}

@injectable()
export class ExportService {
  private readonly options: ExportServiceOptions;

  constructor(@inject(ExportServiceOptions.OptionsToken) options: IOptions<ExportServiceOptions>) {
    this.options = options.value;
  }
}