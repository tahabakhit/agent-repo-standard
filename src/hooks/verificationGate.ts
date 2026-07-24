import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Verification-gated outward actions.
 *
 * An outward action (publish, push) is hard to reverse and must not proceed on
 * the model's say-so. When a repository has opted into a governed workflow (a
 * `.amanar/workflow.json` contract exists), the gate blocks such actions unless
 * the kernel reports the contract verified — evidence (receipts), never
 * narration. Repos without a contract are left to the backpressure floor
 * (classify.ts). The gate is fail-closed: any inability to prove verification
 * (missing kernel, unreadable status) blocks.
 *
 * This is a HARD gate: callers turn a block into a deny decision, never into
 * advisory context the model can ignore.
 */

export type OutwardAction = "push" | "publish";

/** Classify a bash command as an outward action, or null when it is not one. */
export function outwardActionKind(command: string): OutwardAction | null {
  const c = command.trim();
  if (/\bgit\s+push\b/.test(c)) return "push";
  if (/\b(npm|yarn|pnpm)\s+publish\b/.test(c)) return "publish";
  if (/\bgh\s+release\s+create\b/.test(c)) return "publish";
  return null;
}

/** True iff a governed workflow contract exists at `root`. */
export function hasContract(root: string): boolean {
  return existsSync(join(root, ".amanar", "workflow.json"));
}

/** Parse kernel `status --json`; verified iff status is verified and current. */
export function parseVerified(statusJson: string): boolean {
  try {
    const r = JSON.parse(statusJson) as { status?: unknown; current?: unknown };
    return r.status === "verified" && r.current === true;
  } catch {
    return false;
  }
}

export type KernelStatusRunner = (root: string, cli: string) => string;

function defaultRunner(root: string, cli: string): string {
  const res = spawnSync(process.execPath, [cli, "status", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  return res.stdout ?? "";
}

/**
 * Run the vendored kernel and report whether external evidence is verified.
 * Fail-closed: a missing kernel or unparseable status returns false.
 */
export function evidenceVerified(root: string, runner: KernelStatusRunner = defaultRunner): boolean {
  const cli = join(root, ".amanar", "kernel", "amanar-workflow.ts");
  if (!existsSync(cli)) return false;
  return parseVerified(runner(root, cli));
}

export interface GateDecision {
  block: boolean;
  reason?: string;
}

export interface GateDeps {
  hasContract?: (root: string) => boolean;
  verified?: (root: string) => boolean;
}

/**
 * Gate an outward action against external evidence. Applies only when the repo
 * has a contract; otherwise the floor governs. Blocks unless verified.
 */
export function gateOutwardAction(command: string, root: string, deps: GateDeps = {}): GateDecision {
  const kind = outwardActionKind(command);
  if (kind === null) return { block: false };
  const contractPresent = (deps.hasContract ?? hasContract)(root);
  if (!contractPresent) return { block: false };
  const ok = (deps.verified ?? evidenceVerified)(root);
  if (ok) return { block: false };
  return {
    block: true,
    reason:
      `amanar: ${kind} blocked — the workflow contract is not verified. ` +
      `Drive the controller to verified (receipts, not narration) before this outward action.`,
  };
}
