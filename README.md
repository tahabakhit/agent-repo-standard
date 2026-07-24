# Amanar

Amanar is Ameɣrad's reusable, portable, independently testable instrument suite.
It retains the full `agent-repo-standard` history and the signed final compatibility
tag `legacy-fixed-v1.0.11` at commit `9feb596`.

## Components

- [`harness/`](harness/) — adaptive repository harness and `amanar-scaffold`
- [`workflow/`](workflow/) — inquiry, design, assurance, verification, and evaluation
- [`knowledge/`](knowledge/) — config-driven knowledge-save CLI (portable, user-owned store)
- [`storage/synology-mcp/`](storage/synology-mcp/) — portable read-only DSM MCP adapter
- Tiered Hermes was extracted to [`../ayyur/tiered-hermes/`](../ayyur/tiered-hermes/) (independent repository)

The five instrument skills (four workflow + scaffold) support Pi and Claude Code
first-class and Codex best-effort, with per-skill invocation (model-invocable by
default; explicit-only for live-effect skills). `workflow/agent-eval` remains
Codex-native pending a Pi-first rework.

The historical fixed Copier generator was removed from the current branch after
the compatibility tag. Retrieve it from that tag only; it is not a current
Amanar interface.

Amanar does not contain Mogador deployment state. Igoudar records accepted tool
relationships, while Anẓar owns private deployment and operational use.

## Validation

```sh
make validate
```
