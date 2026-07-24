# ADR-0001: Use native Codex orchestration and one deterministic recorder

## Status

Superseded by [ADR-0002](0002-harness-agnostic-orchestration.md)

## Date

2026-07-17

## Context

Agent Eval must launch independent evaluation methods, preserve evidence, compute one transparent score, and show results locally. A custom orchestration server would duplicate Codex's subagents and add a daemon, API, database, and another permission boundary.

Evaluator-local scores also cannot be averaged safely: Plugin Eval measures Codex structure and token budgets, Promptfoo measures runtime behavior, Harbor measures deterministic repository outcomes, and Inspect supplies deeper diagnostics.

## Decision

Use the current Codex task as the only orchestrator and canonical writer. Give each evaluator subagent one method and a temporary output directory. Use one dependency-free Node script to validate artifacts, derive measured-state proof, calculate scores and confidence, write canonical JSON atomically, and render a self-contained offline dashboard.

The dashboard never launches commands. It only displays evidence and copies `$agent-eval:evaluate-all` invocations.

## Alternatives considered

### Local web service with a job queue and database

Rejected because Codex already supplies the needed orchestration and approval surface. A service would add lifecycle, authentication, storage migration, and recovery work without improving the first use case.

### Run every framework and average its score

Rejected because the methods overlap and own different claims. Missing adapters would also be mistaken for poor candidate quality.

### Store only Markdown in the wiki

Rejected because prose cannot reliably enforce the scoring formula, measured-evidence gate, or combination calculation. The wiki remains the concise curated summary, not the executable source of truth.

## Consequences

- The Codex workflow is a namespaced skill: `$agent-eval:evaluate-all`.
- A current Codex task is required for orchestration; the static dashboard cannot start a run.
- Plugin Eval and Promptfoo work now. Harbor and Inspect remain optional until their distinct evidence is needed.
- Pi and Hermes require adapters before behavioral results can be called measured.
- The implementation has no runtime dependencies beyond Node.js and installed evaluator CLIs.
