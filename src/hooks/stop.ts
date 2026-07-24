import { hasContract as defaultHasContract, evidenceVerified } from "./verificationGate.ts";

/**
 * Claude Code Stop completion gate.
 *
 * Claude is the one harness with a force-to-completion hook: on Stop, the kit
 * blocks ending the turn while a governed workflow contract is unverified, so
 * "done" is gated on external evidence rather than the model's narration. The
 * gate is guarded by `stop_hook_active` — when Claude is already continuing
 * because of a prior Stop block, the gate stands down to avoid an infinite
 * loop. On Pi/Codex (no completion hook) the runner holds "done" instead.
 *
 * HARD gate: emits `decision: block`, never advisory context.
 */

export interface StopPayload {
  stop_hook_active?: boolean;
  cwd?: string;
}

export interface StopDeps {
  hasContract?: (root: string) => boolean;
  verified?: (root: string) => boolean;
}

export interface StopDecision {
  block: boolean;
  reason?: string;
}

/** Pure Stop decision: block iff a contract exists, is unverified, and we are
 * not already inside a Stop-hook continuation. */
export function decideStop(payload: StopPayload, root: string, deps: StopDeps = {}): StopDecision {
  if (payload.stop_hook_active === true) return { block: false };
  const contractPresent = (deps.hasContract ?? defaultHasContract)(root);
  if (!contractPresent) return { block: false };
  const ok = (deps.verified ?? evidenceVerified)(root);
  if (ok) return { block: false };
  return {
    block: true,
    reason:
      "amanar: the active workflow contract is not verified. Drive the controller " +
      "to verified (run the declared checks and `verify`), or record a blocker with " +
      "`block --reason`, before ending.",
  };
}

/** Serialize a Stop decision to Claude Code's Stop hook JSON, or null to allow. */
export function buildStopOutput(decision: StopDecision): string | null {
  if (!decision.block) return null;
  return JSON.stringify({
    decision: "block",
    reason: decision.reason ?? "amanar: completion gate not satisfied",
  });
}

export async function runStop(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();

  let payload: StopPayload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw) as StopPayload;
    } catch {
      process.exit(0); // malformed — never block on parse failure
    }
  }

  const root = payload.cwd ?? process.cwd();
  const output = buildStopOutput(decideStop(payload, root));
  if (output !== null) process.stdout.write(output);
  process.exit(0);
}
