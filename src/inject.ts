import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Injection content builders.
 *
 * L3 of the enforcement architecture: keep the active checklist in front of the
 * model across context boundaries (compaction, new turns, session start). This
 * is soft context — memory preservation, not a safety invariant — so it is
 * emitted as additionalContext/systemPrompt per harness, never as a hard gate.
 * The invariants themselves are held by the pre-gate, the completion gate, and
 * the runner.
 */

export type StatusRunner = (root: string) => string;

function defaultStatusRunner(root: string): string {
  const cli = join(root, ".amanar", "kernel", "amanar-workflow.ts");
  if (!existsSync(cli)) return "";
  const res = spawnSync(process.execPath, [cli, "status", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  return res.stdout ?? "";
}

function safeParse(json: string): { status?: unknown; current?: unknown; problems?: unknown } | null {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * A short, injectable summary of the active workflow contract and its unmet
 * evidence, or null when no contract governs the repo or it is already verified
 * and current (nothing to re-inject).
 */
export function activeWorkflowContext(root: string, runner: StatusRunner = defaultStatusRunner): string | null {
  const contractPath = join(root, ".amanar", "workflow.json");
  if (!existsSync(contractPath)) return null;

  let objective = "the active workflow";
  try {
    const c = JSON.parse(readFileSync(contractPath, "utf8")) as { objective?: unknown };
    if (typeof c.objective === "string" && c.objective.trim()) objective = c.objective.trim();
  } catch {
    /* keep default */
  }

  const parsed = safeParse(runner(root));
  const status = typeof parsed?.status === "string" ? parsed.status : "unknown";
  const current = parsed?.current === true;
  const problems = Array.isArray(parsed?.problems) ? (parsed!.problems as unknown[]).map(String) : [];

  if (status === "verified" && current) return null;

  const lines = [
    `[amanar] Active workflow: ${objective}`,
    `Controller status: ${status}${current ? "" : " (unmet or stale)"}.`,
  ];
  if (problems.length) lines.push(`Unmet: ${problems.slice(0, 6).join("; ")}`);
  lines.push("Completion is proven by controller receipts (run the checks, then verify), not by narration.");
  return lines.join("\n");
}
