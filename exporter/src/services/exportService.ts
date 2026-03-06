import { inject } from "tsyringe";
import { z } from "zod";
import { IOptions } from "../infratructure/config/IOptions";

const ExportServiceOptionsSchema = z.object({
    db_connection: z.object({
        host: z.string().min(1),
        port: z.number().int().positive(),
        username: z.string().min(1),
        password: z.string().min(1),
        database: z.string().min(1)
    })
}).strict();

type ExportServiceOptions1 = z.infer<typeof ExportServiceOptionsSchema>;

export class ExportServiceOptions  {
    public static readonly OptionsToken: string = "ExportServiceOptions";
    public static readonly SectionName: string = "exportService";
}

export class ExportService {
    constructor(@inject(ExportServiceOptions.OptionsToken) options: IOptions<ExportServiceOptions>) {
    }
}

