import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Backpressure pre-commit gate. Refuses the commit unless structural checks
 * pass: `git diff --cached --check` (whitespace / conflict markers) and, when a
 * workflow contract is present, every declared check command from
 * `.amanar/workflow.json`. Structural backpressure over model cleverness — the
 * same checks that gate the controller's `verify` also gate the commit.
 *
 * Ported from harness/backpressure/pre-commit (Python).
 */

interface WorkflowCheck {
  id?: string;
  command: string;
  expectedExit?: number;
  outputContains?: string[];
  timeoutSeconds?: number;
}

export function runPreCommit(cwd: string = process.cwd()): number {
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  const root = (top.stdout ?? "").trim() || cwd;
  const problems: string[] = [];

  const whitespace = spawnSync("git", ["diff", "--cached", "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  if (whitespace.status !== 0) {
    problems.push(
      "whitespace or conflict markers in staged changes:\n" + (whitespace.stdout ?? "").trim(),
    );
  }

  const contractPath = join(root, ".amanar", "workflow.json");
  if (existsSync(contractPath) && statSync(contractPath).isFile()) {
    let checks: WorkflowCheck[] = [];
    try {
      const parsed = JSON.parse(readFileSync(contractPath, "utf8")) as { checks?: WorkflowCheck[] };
      checks = parsed.checks ?? [];
    } catch (exc) {
      problems.push(`cannot read workflow contract: ${(exc as Error).message}`);
    }
    for (const check of checks) {
      const result = spawnSync(check.command, {
        shell: true,
        cwd: root,
        encoding: "utf8",
        timeout: (check.timeoutSeconds ?? 120) * 1000,
      });
      if (result.error && (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
        problems.push(`check ${check.id ?? "?"} timed out`);
        continue;
      }
      const combined = (result.stdout ?? "") + (result.stderr ?? "");
      const expectedExit = check.expectedExit ?? 0;
      const contains = check.outputContains ?? [];
      if (result.status !== expectedExit || !contains.every((token) => combined.includes(token))) {
        problems.push(`check ${check.id ?? "?"} failed`);
      }
    }
  }

  if (problems.length) {
    process.stderr.write("backpressure: commit blocked\n");
    for (const problem of problems) process.stderr.write("  - " + problem + "\n");
    return 1;
  }
  return 0;
}
