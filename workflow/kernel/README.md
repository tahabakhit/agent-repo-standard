# Amanar workflow kernel

This directory contains Amanar's host-independent workflow contract and
deterministic controller. It is deliberately not an agent runtime or scheduler.

Consumers opt in by vendoring this directory at `.amanar/kernel/` and pinning
the exact controller release in `.amanar/kernel/VERSION`. The file must match
`python3 .amanar/kernel/amanar-workflow --version`. Run the pinned CLI from
the target repository root:

```sh
python3 .amanar/kernel/amanar-workflow validate
python3 .amanar/kernel/amanar-workflow begin
python3 .amanar/kernel/amanar-workflow run-check tests
python3 .amanar/kernel/amanar-workflow verify
```

The target contract is `.amanar/workflow.json`. Runtime state, bounded output,
and receipts are written beneath `.amanar/run/`, which projects should ignore.
See [the contract](docs/contract.md) for the complete interface and safety rules.
Amanar does not install the controller globally or select an unpinned copy from
`PATH`.
