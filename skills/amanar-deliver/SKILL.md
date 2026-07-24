---
name: amanar-deliver
description: Route a resumable or material objective through the deterministic workflow controller — author a contract, then validate, begin, run declared checks, and verify against receipts. Use only when explicitly invoked.
disable-model-invocation: true
---

# Amanar Deliver

Inspect existing context first. Classify the work as bounded, managed, or high
assurance and collapse stages that add no value. Do not begin implementation while a
blocker or a consequential authority question is unresolved.

Completion is proven by controller receipts, never by narration. A statement that a
check passed is not evidence; only a receipt is.

## Run the controller

The controller is the vendored `.amanar/kernel/amanar-workflow.ts`, run with Node
(>=22) from the repository root. Author the task as `.amanar/workflow.json` (see the
kernel contract), or compile one from a task-spec with
`node .amanar/kernel/src/tools/compileTaskSpec.ts <spec.json>`. Then run, in order:

1. `node .amanar/kernel/amanar-workflow.ts validate`
2. `node .amanar/kernel/amanar-workflow.ts begin` — required once before any check.
3. `node .amanar/kernel/amanar-workflow.ts run-check <id>` — for every check.
4. `node .amanar/kernel/amanar-workflow.ts verify` — the only route to verified.

`status --json` reports the derived state and any stale receipts; the `--json` flag
is required. `block --reason "<text>"` records a blocker, after which `begin` resumes.

The objective is complete only when `verify` prints `AMANAR_VERIFIED` and
`status --json` shows `"status": "verified"` with `"current": true`. Do not skip
`begin` or `verify`, and do not substitute a summary for either. Use `block` only
when this workflow cannot reach its own acceptance; that separate, out-of-scope work
remains unauthorized is a fact to report, not a reason to block — when the declared
checks pass and the artifacts exist, `verify`. If a check fails or a receipt goes
stale, fix the cause, rerun that check, then `verify` again. A check
with a live effect runs only when the contract grants live-effect authority; saved
state never grants it.

## Resume and handoff

To hand off or resume, render a deterministic digest of controller state:

`node .amanar/kernel/src/tools/renderHandoff.ts`

It reports the derived state, each receipt's current/stale/missing verdict, the
id/artifact closet, and the ordered rebuild to verified. See
[handoff](references/handoff.md).
