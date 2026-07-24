import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { catalogLines } from "./routing.ts";

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

/**
 * The one-time orientation pointer: tells the agent the amanar-* skills are
 * loaded. Not a coercive prompt — brief discovery so the agent knows the tools
 * exist. Injected on the first turn only (see buildPiInjection).
 */
export function bootstrapPointer(): string {
  return (
    "[amanar:bootstrap] Amanar skills are loaded (prefix $amanar-). " +
    "Use them when they apply; ignore this note otherwise."
  );
}

/** Marker so an injection can be deduplicated within a session (Pi context). */
export const CATALOG_MARKER = "amanar:catalog:v1";

/** The skill catalog, injected at session start so the agent knows what is loaded. */
export function sessionCatalog(): string {
  return [`[${CATALOG_MARKER}] Amanar skills loaded:`, ...catalogLines()].join("\n");
}

/**
 * When a repository has no `.amanar/` control directory, nudge toward onboarding.
 * Discovery only — onboarding stays an explicit action.
 */
export function onboardingNudge(root: string): string | null {
  if (existsSync(join(root, ".amanar"))) return null;
  return "[amanar] No .amanar/ control directory here. For governed work, run $amanar-onboard to set up the repository harness.";
}

/**
 * The always-on essence directive, re-injected each turn to resist drift.
 * The full discipline lives in the amanar-essence skill; this is the standalone
 * one-line contract so it holds even without the skill in context.
 */
export function essenceDirective(): string {
  return (
    "[amanar:essence] Write only what you mean, not a word more. Every reader-facing " +
    "artifact must stand on its own: no references to this conversation, no reflexive " +
    "hedging or preamble, normal grammar (not telegraphic). Keep every fact, decision, " +
    "caveat, and all code/paths/commands verbatim."
  );
}

/**
 * Build the per-turn injection: the essence directive (unless toggled off) plus
 * the active workflow context. Returns null when there is nothing to inject.
 */
export function buildTurnInjection(
  root: string,
  opts: { essenceOn?: boolean; statusRunner?: StatusRunner } = {},
): string | null {
  const parts: string[] = [];
  if (opts.essenceOn !== false) parts.push(essenceDirective());
  const wf = activeWorkflowContext(root, opts.statusRunner ?? defaultStatusRunner);
  if (wf !== null) parts.push(wf);
  return parts.length ? parts.join("\n\n") : null;
}

/**
 * Compose the Pi `before_agent_start` injection block appended to the assembled
 * system prompt. On the first turn it prepends the one-time orientation: the
 * bootstrap pointer, the skill catalog, and (when the repo is ungoverned) the
 * onboarding nudge. Every turn it appends the per-turn injection (essence
 * directive + active workflow context). Returns null when there is nothing to
 * add. Pure — the extension wires it; tests exercise it without a live Pi.
 */
export function buildPiInjection(
  root: string,
  opts: {
    firstTurn: boolean;
    essenceOn?: boolean;
    statusRunner?: StatusRunner;
    /** Optional extra first-turn lines (e.g. native-tool / model hints). */
    firstTurnExtras?: Array<string | null>;
  },
): string | null {
  const parts: string[] = [];
  if (opts.firstTurn) {
    parts.push(bootstrapPointer());
    parts.push(sessionCatalog());
    const nudge = onboardingNudge(root);
    if (nudge !== null) parts.push(nudge);
    for (const extra of opts.firstTurnExtras ?? []) {
      if (extra !== null && extra !== undefined && extra !== "") parts.push(extra);
    }
  }
  const turn = buildTurnInjection(root, {
    essenceOn: opts.essenceOn,
    statusRunner: opts.statusRunner,
  });
  if (turn !== null) parts.push(turn);
  return parts.length ? parts.join("\n\n") : null;
}
