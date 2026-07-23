# Asturlab

Asturlab is Qawn's reusable, portable, independently testable instrument suite.
It retains the full `agent-repo-standard` history and the signed final compatibility
tag `legacy-fixed-v1.0.11` at commit `9feb596`.

## Components

- [`harness/`](harness/) — adaptive repository harness and `amanar-scaffold`
- [`workflow/`](workflow/) — inquiry, design, orchestration, assurance, and evaluation
- [`storage/synology-mcp/`](storage/synology-mcp/) — portable read-only DSM MCP adapter
- [`agents/tiered-hermes/`](agents/tiered-hermes/) — optional portable Hermes memory provider

The six workflow and scaffold instrument skills support Claude, Pi, and Codex.
`workflow/agent-eval` remains Codex-native.

The historical fixed Copier generator was removed from the current branch after
the compatibility tag. Retrieve it from that tag only; it is not a current
Asturlab interface.

Asturlab does not contain Mogador deployment state. Atlas records accepted tool
relationships, while Maydan owns private deployment and operational use.

## Validation

```sh
make validate
```
