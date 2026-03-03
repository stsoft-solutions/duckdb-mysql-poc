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

  console.log("Hello from CLI!");
  return 0;
}
