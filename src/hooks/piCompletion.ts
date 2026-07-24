import { hasContract as defaultHasContract, evidenceVerified } from "./verificationGate.ts";

/**
 * Pi completion gate.
 *
 * Pi has no force-to-completion hook and no blocking "stop" event: `agent_settled`
 * fires once a run has fully settled and cannot return a block. So the gate holds
 * "done" the only way Pi allows — by driving continuation: on settle, if a
 * governed workflow contract is present and unverified, re-inject the same
 * evidence demand the Claude Stop gate uses via `pi.sendUserMessage`, which
 * triggers another turn.
 *
 * Pi also gives no `stop_hook_active` flag, so loop-safety is ours: a bounded
 * nudge counter caps continuations (default 1). Past the cap the gate stands
 * down and the runner-holds-done floor takes over, so a model that cannot reach
 * verified never loops forever. The counter resets when the contract is verified
 * or absent, so a later unmet contract can nudge again.
 *
 * This is enforcement by continuation, not a block — but it functionally gates
 * completion on external evidence, which is why capabilities marks Pi
 * `completionGate: true`.
 */

/** Default maximum re-injections per unverified contract before standing down. */
export const PI_NUDGE_CAP = 1;

export interface PiSettleState {
  /** How many continuation nudges have already fired for the current contract. */
  nudges: number;
}

export type PiSettleAction = "continue" | "reset" | "stand-down";

export interface PiSettleDecision {
  action: PiSettleAction;
  /** Continuation message, present only when action is "continue". */
  reason?: string;
}

export interface PiSettleDeps {
  hasContract?: (root: string) => boolean;
  verified?: (root: string) => boolean;
}

export const PI_CONTINUE_REASON =
  "amanar: the active workflow contract is not verified. Do not stop — drive the " +
  "controller to verified (run the declared checks and `verify`), or record a blocker " +
  "with `block --reason`, then continue.";

/**
 * Decide what to do when a Pi agent run settles.
 *
 * - no contract → reset the counter (nothing governed here)
 * - verified → reset (done; a future unmet contract may nudge again)
 * - unverified, under the cap → continue (re-inject the evidence demand)
 * - unverified, at/over the cap → stand down (bounded; runner holds done)
 */
export function decidePiSettle(
  root: string,
  state: PiSettleState,
  deps: PiSettleDeps = {},
  cap: number = PI_NUDGE_CAP,
): PiSettleDecision {
  const contractPresent = (deps.hasContract ?? defaultHasContract)(root);
  if (!contractPresent) return { action: "reset" };

  const ok = (deps.verified ?? evidenceVerified)(root);
  if (ok) return { action: "reset" };

  if (state.nudges >= cap) return { action: "stand-down" };
  return { action: "continue", reason: PI_CONTINUE_REASON };
}
