---
name: amanar-orchestrate
description: Deprecated — coordinate multi-phase work through host-native scheduling plus the deterministic controller. Use only when explicitly invoked.
disable-model-invocation: true
---

# Amanar Orchestrate (deprecated)

Retired from portable policy in the first kernel release, and retained for one
release under its explicit name so existing invocations do not break.

Multi-phase coordination is now host-native. Use your harness's own planning,
delegation, and context management for topology, and route execution and acceptance
through `$amanar-workflow` and the vendored controller
(`.amanar/kernel/amanar-workflow`), which owns state, checks, receipts, and verified
completion. A permissive runtime grants capability, not authority: resolve
consequential effects through an explicit gate.

Prefer `$amanar-inquire` for framing, `$amanar-design` for design, and
`$amanar-workflow` for governed execution.
