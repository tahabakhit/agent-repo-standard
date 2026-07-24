# Architecture

The kit's value is the forcing layer, not the advice. Model self-invocation is
never load-bearing for safety, verification, or completion; those invariants hold
only through deterministic forcing. The one mechanism uniform across Claude, Pi,
and Codex is a runner that owns the loop and gates "done" on external evidence.

## Enforcement layers

Each procedure is authored once as data the runner executes; a skill's prose is
for discovery only. The layers degrade gracefully.

- **L0 — Runner owns the loop (primary).** The kernel + bounded loop
  (`src/kernel`, `src/loop`) drive contract → begin → run-check → verify, grade
  world-state from `status --json`, and never emit "done" until an un-gameable
  external check passes. The model runs as a subprocess per step.
- **L1 — Single funnel dispatcher.** `bin/amanar hook <event>` handles every
  event: PreToolUse backpressure deny, the verification gate on outward actions
  (publish blocked unless the kernel reports verified), the Claude Stop
  completion gate (guarded by `stop_hook_active`), and PreCompact re-injection.
- **L2 — Cheap-model evaluator (optional).** A judge separate from the generator
  (`src/evaluator.ts`) for what a rule table cannot express. Disabled by default,
  fail-closed; the invariants never depend on it.
- **L3 — Always-on injection.** SessionStart catalog + missing-`.amanar/`
  onboarding nudge; UserPromptSubmit re-injection of the active checklist and the
  essence directive; platform-adaptive (Claude additionalContext, Pi context
  event, Codex AGENTS.md). Soft context — memory preservation, not a gate.
- **L4 — Deterministic contracts (floor).** The advice skills and the backpressure
  classifier where no hook or runner exists.

Hard gates are always deny/decision-block, never advisory context the model can
ignore. Routing is deterministic keyword tables (`src/routing.ts`), never free
model judgment.

## Capability gating

Forcing mechanisms do not generalize: Claude has both an unbypassable PreToolUse
deny and a force-to-completion Stop gate; Pi has a tool-call block and per-turn
injection but no completion gate; Codex has only a shell-level deny. The runner
floor is present everywhere. `src/capabilities.ts` is the one place these
per-harness assumptions live, so every layer degrades per harness/version as the
harnesses change.

## Native-tool adaptation

`src/nativeTools.ts` is a static per-(harness, version) capability manifest gated
by a runtime-detected version. Intent → native routing prefers a native
mechanism (Claude plan mode / subagents / workflows / deep-research, Codex /plan
/ subagents, MCP everywhere) and degrades down a ladder to the portable floor
(skills + MCP) when it is unavailable. Version-gating is hard: a capability whose
min-version cannot be confirmed is treated as absent.

## Weak models

`src/weakModel.ts` shapes requests for weaker models: forced tool_choice,
minimal tool sets, few-shot-as-messages, and plan-once-then-execute. Combined
with deterministic routing, adherence comes from constraining the request, not
from trusting the model.
