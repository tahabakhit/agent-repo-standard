# Agent Eval

Outside eval gate for the Amanar agent-kit. Run evidence-backed evaluations of skills, plugins, tools, and explicit combinations from any agent harness (Pi primary; Claude Code and Codex also supported), then browse the normalized scorecard offline. Runs at CI or pre-PR, outside the harness inner loop.

## Use it

The current agent task (in any harness — Pi primary, Claude Code, Codex, or another) delegates independent evaluator lanes, reconciles their evidence, and writes the canonical result. The web page only displays results and copies new commands; it cannot execute anything.

When the plugin is installed under Codex or Claude Code, invoke with:

```text
$agent-eval:evaluate-all <target> --mode quick|full --platforms codex,claude-code,pi,hermes,opencode
```

From Pi or another harness, invoke the skill by task instruction using the same options.

Evidence labels are strict:

- `measured`: every axis is measured and paired baseline/candidate trials have deterministic outcome verification;
- `mixed`: runtime observations plus static or source judgments;
- `estimated`: source, static, validation, or smoke evidence only.

Each axis carries its own evidence label; non-estimated axes must cite a verified runtime artifact. Platform proof is scoped to the platform that produced it. Version 0.1 scores explicit combinations as estimates and rejects a measured-combination claim until native, A, B, and A+B artifacts can all be verified. Canonical records pin every artifact and normalized run scoring content with SHA-256 digests, so later edits fail validation.

## Local commands

| Command | Purpose |
|---|---|
| `npm test` | Run the built-in Node test suite |
| `node scripts/agent-eval.mjs detect` | Check evaluator availability without inheriting secrets |
| `node scripts/agent-eval.mjs record <run.json>` | Validate and record a draft run |
| `npm run check` | Validate canonical runs and the dashboard template |
| `npm run render` | Rebuild `data/index.json` and `dist/index.html` |

No package installation or build framework is required. Node.js 20 or newer is enough.

## Install or remove the local plugin

Expose the repository through your personal marketplace, add its entry to `~/.agents/plugins/marketplace.json`, then install it:

```text
~/plugins/agent-eval -> /absolute/path/to/agent-eval
source.path: ./plugins/agent-eval
```

```sh
codex plugin add agent-eval@personal
codex plugin list
```

The recorder follows that marketplace symlink back to the repository so canonical data is not written into Codex's disposable plugin cache. `AGENT_EVAL_HOME=/another/path` overrides the data location.

Remove the installed plugin and symlink without deleting canonical evaluations:

```sh
codex plugin remove agent-eval@personal
rm ~/plugins/agent-eval
```

Remove the `agent-eval` marketplace entry separately if the plugin will not be reinstalled.

## Architecture

- The current agent task (Pi primary; Claude Code/Codex also) owns orchestration and subagent lifecycle.
- Evaluators own only their raw method evidence.
- `scripts/agent-eval.mjs` is the sole score, confidence, path, and rendering authority.
- Reviewed JSON is canonical; raw artifacts stay ignored; `dist/index.html` is generated offline.

See the [approved product specification](docs/reference/product-spec.md), [ADR-0001](docs/decisions/adrs/0001-native-codex-orchestration.md) (superseded), and [ADR-0002](docs/decisions/adrs/0002-harness-agnostic-orchestration.md).
