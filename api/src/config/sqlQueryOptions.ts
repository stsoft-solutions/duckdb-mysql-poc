import { z } from "zod";
import type { OptionsTokenProvider } from "@duckdb-poc/shared-infra";

const SqlFederatedTableSchema = z.object({
  table: z.string().min(1),
  table_override: z.string().min(1).optional(),
  field: z.string().min(1),
  field_type: z.enum(["epoch", "epoch_ms", "datetime"]),
  parquet_glob: z.string().min(1).optional(),
}).strict();

const SqlQueryOptionsSchema = z.object({
  db_connection: z.string().min(1).default("processing"),
  mysql_schema: z.string().min(1).default("mysql_db"),
  parquet_root: z.string().min(1).default("../local_storage/export"),
  timeout_ms: z.number().int().positive().default(30_000),
  initialize_on_startup: z.boolean().default(true),
  tables: z.array(SqlFederatedTableSchema).min(1),
}).strict().transform((data) => ({
  dbConnection: data.db_connection,
  mysqlSchema: data.mysql_schema,
  parquetRoot: data.parquet_root,
  timeoutMs: data.timeout_ms,
  initializeOnStartup: data.initialize_on_startup,
  tables: data.tables.map((table) => ({
    table: table.table,
    table_override: table.table_override,
    field: table.field,
    fieldType: table.field_type,
    parquetGlob: table.parquet_glob,
  })),
}));

export type SqlQueryOptions = z.output<typeof SqlQueryOptionsSchema>;

export const SqlQueryOptionsProvider: OptionsTokenProvider<SqlQueryOptions> = {
  OptionsToken: "SqlQueryOptions",
  SectionName: "sql_query",
  hydrate: (raw: unknown) => SqlQueryOptionsSchema.parse(raw ?? {}),
};

