import { fileURLToPath } from "node:url";
import { validateOnboard } from "./onboard.ts";
import { validateWorkflow } from "./workflow.ts";
import { validateComponents } from "./components.ts";
import { validateSkillConsistency } from "./skillConsistency.ts";

/**
 * Run every Amanar validator against `repoRoot`. Prints each PASS line and, on
 * the first failure, a `FAIL [name]: message` line, then exits non-zero.
 */
export function runValidators(repoRoot: string): void {
  // This validator's own source names the estate identifier (assembled from
  // fragments) and is skipped by the components scan.
  const identifierSources = [fileURLToPath(new URL("./components.ts", import.meta.url))];

  const steps: Array<[string, () => string]> = [
    ["onboard", () => validateOnboard(repoRoot)],
    ["skills", () => validateWorkflow(repoRoot)],
    ["components", () => validateComponents(repoRoot, identifierSources)],
    ["skill-consistency", () => validateSkillConsistency(repoRoot)],
  ];

  for (const [name, fn] of steps) {
    try {
      console.log(fn());
    } catch (err) {
      console.error(`FAIL [${name}]: ${(err as Error).message}`);
      process.exit(1);
    }
  }
  console.log("PASS: all amanar validators");
}
