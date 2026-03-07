import { inject, injectable } from "tsyringe";
import { z } from "zod";
import { Options } from "../infratructure/config/Options";

const TableDefinitionSchema = z.object({
  schema: z.string().min(1),
  table: z.string().min(1),
  timespan_column: z.object({
    name: z.string().min(1),
    time_format: z.enum(["timestamp", "hour", "minute"])
  })
}).strict();

const ExportServiceOptionsSchema = z.object({
  db_connection: z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    username: z.string().min(1),
    password: z.string().min(1),
    database: z.string().min(1)
  }).strict(),
  tables: z.array(TableDefinitionSchema).min(1)
}).strict();

type ExportServiceOptionsType = z.infer<typeof ExportServiceOptionsSchema>;

export class ExportServiceOptions {
  public static readonly OptionsToken: string = "ExportServiceOptions";
  public static readonly SectionName: string = "export_service";

  public DbConnection: ExportServiceOptionsType["db_connection"];

  constructor(dbConnection: ExportServiceOptionsType["db_connection"]) {
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

  constructor(@inject(ExportServiceOptions.OptionsToken) options: Options<ExportServiceOptions>) {
    this.options = options.value;
  }
}