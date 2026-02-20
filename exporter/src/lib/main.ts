export async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("Usage: mycli [--help]");
    return 0;
  }

  console.log("Hello from CLI!");
  return 0;
}