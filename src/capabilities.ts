/**
 * Capability gating for the enforcement layers.
 *
 * The forcing layers (pre-gate deny, completion gate, injection) do not
 * generalize across harnesses: Claude Code has both an unbypassable PreToolUse
 * deny AND a force-to-completion Stop gate; Pi has a tool-call block, per-turn
 * system-prompt injection, AND a completion gate implemented by continuation
 * (agent_settled cannot block, so the extension re-injects the evidence demand
 * via sendUserMessage — bounded by a nudge cap); Codex has only a shell-level
 * deny (hooks off by default). The one mechanism uniform everywhere is the
 * runner that owns the loop and gates "done" on external evidence.
 *
 * Every forcing layer consults `capable()` before relying on a mechanism, so
 * the kit degrades to the runner-holds-done floor where a mechanism is absent —
 * and so assumptions can be relaxed per harness/version as the harnesses
 * improve (they move weekly). Capability assumptions go stale; this table is
 * the one place to update them.
 */

export type Harness = "claude" | "pi" | "codex";

export type Capability =
  /** An unbypassable pre-execution deny (rule-table gate before a tool runs). */
  | "preToolUseDeny"
  /** A force-to-completion gate that can block "done" until evidence passes. */
  | "completionGate"
  /** Per-turn or per-compaction re-injection of the active checklist/catalog. */
  | "reinjection"
  /** The runner owns the loop and gates done on external evidence (the floor). */
  | "runnerHoldsDone";

export interface CapabilitySet {
  preToolUseDeny: boolean;
  completionGate: boolean;
  reinjection: boolean;
  runnerHoldsDone: boolean;
}

/**
 * Conservative per-harness defaults, source-verified against pi-coding-agent
 * 0.82.0 (2026-07). The runner floor is always present. Claude blocks to hold
 * "done"; Pi holds it by bounded continuation on agent_settled (see
 * hooks/piCompletion.ts); Codex has neither and leans on the runner floor.
 */
const TABLE: Record<Harness, CapabilitySet> = {
  claude: { preToolUseDeny: true, completionGate: true, reinjection: true, runnerHoldsDone: true },
  pi: { preToolUseDeny: true, completionGate: true, reinjection: true, runnerHoldsDone: true },
  codex: { preToolUseDeny: true, completionGate: false, reinjection: false, runnerHoldsDone: true },
};

/**
 * Resolve the capability set for a harness. `version` is accepted for future
 * version-gating (harnesses gain/lose capabilities across releases); today the
 * defaults are version-independent, but callers should pass it so relaxations
 * can be added here without changing call sites.
 */
export function capabilitiesFor(harness: Harness, _version?: string): CapabilitySet {
  return TABLE[harness];
}

/** True iff `harness` supports `capability`. */
export function capable(harness: Harness, capability: Capability, version?: string): boolean {
  return capabilitiesFor(harness, version)[capability];
}

/** Recognize a harness name, or null. Used when a hook is told its host. */
export function asHarness(value: string | undefined): Harness | null {
  return value === "claude" || value === "pi" || value === "codex" ? value : null;
}
