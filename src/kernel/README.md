# Amanar workflow kernel

This directory contains Amanar's host-independent workflow contract and
deterministic controller. It is deliberately not an agent runtime or scheduler.

Consumers opt in by vendoring this directory at `.amanar/kernel/` and pinning
the exact controller release in `.amanar/kernel/VERSION`. The file must match
`node .amanar/kernel/amanar-workflow.ts --version`. Run the pinned CLI from
the target repository root:

```sh
node .amanar/kernel/amanar-workflow.ts validate
node .amanar/kernel/amanar-workflow.ts begin
node .amanar/kernel/amanar-workflow.ts run-check tests
node .amanar/kernel/amanar-workflow.ts verify
```

The target contract is `.amanar/workflow.json`. Runtime state, bounded output,
and receipts are written beneath `.amanar/run/`, which projects should ignore.
See [the contract](docs/contract.md) for the complete interface and safety rules.
Amanar does not install the controller globally or select an unpinned copy from
`PATH`.
