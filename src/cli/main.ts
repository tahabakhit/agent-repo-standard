import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runValidators } from "../validators/index.ts";

/** Amanar CLI dispatcher. Grows one subcommand per collapse slice. */
export function main(argv: string[]): void {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const [cmd] = argv;

  switch (cmd) {
    case "validate":
      runValidators(repoRoot);
      break;
    default:
      console.error(`amanar: unknown command '${cmd ?? ""}'. Available: validate`);
      process.exit(2);
  }
}

main(process.argv.slice(2));
