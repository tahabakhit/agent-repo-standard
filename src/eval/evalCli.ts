import { runAllSuites } from "./suites.ts";
import { formatSummary, summarize } from "./metrics.ts";

/**
 * `bin/amanar eval` — run the five suites and print a summary. Exits non-zero on
 * any failure. Kept OUT of `make validate` (it is the regression harness, run in
 * CI), but its framework and the mutation suite are unit-tested inside the gate.
 */
export async function runEval(repoRoot: string): Promise<number> {
  const results = await runAllSuites(repoRoot);
  console.log(formatSummary(results));
  return summarize(results).failed === 0 ? 0 : 1;
}
