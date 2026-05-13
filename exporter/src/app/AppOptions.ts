import { z } from "zod";
import type { OptionsTokenProvider } from "@duckdb-poc/shared-infra";
import { TimeRepresentation } from "../services/exportService.js";

export const AppOptionsSchema = z.object(
  {
    from: z.object({
        year: z.number().min(2000),
        month: z.number().min(1).max(12)
      }
    ).strict(),
    to: z.object({
        year: z.number().min(2000),
        month: z.number().min(1).max(12)
      },
    ).strict(),
    schema_name: z.string().min(1),
    tables: z.array(
      z.object({
        table: z.string().min(1),
        field: z.string().min(1),
        time_representation: z.nativeEnum(TimeRepresentation)
      }).strict()).min(1)
      .transform((tables) => tables.map((table) => ({
        tableName: table.table,
        fieldName: table.field,
        timeRepresentation: table.time_representation
      })))
  }
).strict()
  .transform(data => (
    {
      from: data.from,
      to: data.to,
      schemaName:
      data.schema_name,
      tables: data.tables
    }));

export type AppOptions = z.output<typeof AppOptionsSchema>;

export const AppOptionsProvider: OptionsTokenProvider<AppOptions> = {
  OptionsToken: "AppOptions",
  SectionName: "settings",
  hydrate: (raw: unknown) => AppOptionsSchema.parse(raw ?? {})
};
