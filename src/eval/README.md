# Amanar Eval

Outside eval gate for the Amanar agent-kit. Run evidence-backed evaluations of skills, plugins, tools, and explicit combinations from any agent harness (Pi primary; Claude Code and Codex also supported), then browse the normalized scorecard offline. Runs at CI or pre-PR, outside the harness inner loop.

## Use it

The current agent task (in any harness — Pi primary, Claude Code, Codex, or another) delegates independent evaluator lanes, reconciles their evidence, and writes the canonical result. The web page only displays results and copies new commands; it cannot execute anything.

Invoke by task instruction from any harness:

```text
evaluate-all <target> --mode quick|full --platforms codex,claude-code,pi,hermes,opencode
```

Evidence labels are strict:

- `measured`: every axis is measured and paired baseline/candidate trials have deterministic outcome verification;
- `mixed`: runtime observations plus static or source judgments;
- `estimated`: source, static, validation, or smoke evidence only.

Each axis carries its own evidence label; non-estimated axes must cite a verified runtime artifact. Platform proof is scoped to the platform that produced it. Version 0.1 scores explicit combinations as estimates and rejects a measured-combination claim until native, A, B, and A+B artifacts can all be verified. Canonical records pin every artifact and normalized run scoring content with SHA-256 digests, so later edits fail validation.

## Local commands

| Command | Purpose |
|---|---|
| `npm test` | Run the built-in Node test suite |
| `node recorder.ts detect` | Check evaluator availability without inheriting secrets |
| `node recorder.ts record <run.json>` | Validate and record a draft run |
| `node recorder.ts check` | Validate canonical runs and the dashboard template |
| `node recorder.ts render` | Rebuild `data/index.json` and `dist/index.html` |

No package installation or build framework is required. Node.js 20 or newer is enough.

## Architecture

- The current agent task (Pi primary; Claude Code/Codex also) owns orchestration and subagent lifecycle.
- Evaluators own only their raw method evidence.
- `recorder.ts` is the sole score, confidence, path, and rendering authority.
- Reviewed JSON is canonical; raw artifacts stay ignored; `dist/index.html` is generated offline.

The product specification and ADRs (0001 superseded, 0002) are archived in the
coordination repo under `docs/reference/amanar/eval/`.
