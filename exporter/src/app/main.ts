import {container} from "tsyringe";
import {ConfigurationManager} from "../infratructure/config/configurationManager.js";
import {ExportService} from "../services/exportService";
import {ExportServiceOptionsProvider} from "../services/exportServiceOptions";
import {LoggerOptionsProvider} from "../infratructure/logger/loggerOptions.js";

/**
 * Entry point for the command-line interface.
 *
 * @param {string[]} argv - The array of command-line arguments passed to the program.
 * @return {Promise<number>} A promise that resolves to the program's exit code.
 */
export async function main(argv: string[]): Promise<number> {
    if (argv.includes("--help") || argv.includes("-h")) {
        console.log("Usage: cli [--help]");
        return 0;
    }
    // Set up configuration and services.
    const configurationManager = container.resolve<ConfigurationManager>(ConfigurationManager);

    configurationManager.addOptions(LoggerOptionsProvider);
    configurationManager.addOptions(ExportServiceOptionsProvider);

    const exportService = container.resolve(ExportService);

    try {
        await exportService.export();
    } catch (error) {
        console.error("Export failed:", error);
        return 1;
    }
    return 0;
}
