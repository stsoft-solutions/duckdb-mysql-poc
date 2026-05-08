import { z } from "zod";
import { OptionsTokenProvider } from "../infratructure/config/optionsTokenProvider.js";

const ExportServiceOptionsSchema = z
  .object({
    chunk_size: z.number().int().positive().default(250_000),
    db_connection: z.string().min(1).default("processing"),
    attached_db_alias: z.string().min(1),
    storage_path: z.string().min(1),
    temp_path: z.string().min(1),
  })
  .strict()
  .transform(data => ({
    chunkSize: data.chunk_size,
    dbConnection: data.db_connection,
    attachedDbAlias: data.attached_db_alias,
    storagePath: data.storage_path,
    tempPath: data.temp_path,
  }));

export type ExportServiceOptions = z.output<typeof ExportServiceOptionsSchema>;

export const ExportServiceOptionsProvider: OptionsTokenProvider<ExportServiceOptions> = {
  OptionsToken: "ExportServiceOptions",
  SectionName: "export_service",
  hydrate: (raw: unknown) => ExportServiceOptionsSchema.parse(raw ?? {})
};
