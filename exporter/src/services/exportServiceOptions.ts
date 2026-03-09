import { z } from "zod";
import { OptionsTokenProvider } from "../infratructure/config/optionsTokenProvider";

const DbConnectionSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  username: z.string().min(1),
  password: z.string().min(1),
  database: z.string().min(1)
}).strict();

const TableDefinitionSchema = z.object({
  schema: z.string().min(1),
  table: z.string().min(1),
  timespan_column: z.object({
    name: z.string().min(1),
    time_format: z.enum(["timestamp", "hour", "minute"])
  })
}).strict();

const ExportServiceOptionsSchema = z.object({
  db_connection: DbConnectionSchema,
  tables: z.array(TableDefinitionSchema).min(1)
}).strict();

type DbConnection = z.infer<typeof DbConnectionSchema>;
type TableDefinition = z.infer<typeof TableDefinitionSchema>;

export class ExportServiceOptions {
  public readonly dbConnection: DbConnection;
  public readonly tables: TableDefinition[];

  constructor(dbConnection: DbConnection, tables: TableDefinition[]) {
    this.dbConnection = dbConnection;
    this.tables = tables;
  }

  public static hydrate(raw: unknown): ExportServiceOptions {
    const parsed = ExportServiceOptionsSchema.parse(raw ?? {});
    return new ExportServiceOptions(parsed.db_connection, parsed.tables);
  }
}

export const ExportServiceOptionsProvider: OptionsTokenProvider<ExportServiceOptions> = {
  OptionsToken: "ExportServiceOptions",
  SectionName: "export_service",
  hydrate: (raw: unknown) => ExportServiceOptions.hydrate(raw)
};
