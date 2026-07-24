# Workflow contract 1.0.0

The contract at `.amanar/workflow.json` is the complete portable interface
between a repository task and its acceptance evidence. Host schedulers, agents,
models, plans, and approval user interfaces are intentionally outside it.

## Fields and invariants

- `schemaVersion` is exactly `1.0.0`. Unknown versions and unknown fields fail.
- `id` and check IDs are unique kebab-case identifiers.
- `objective` states the outcome. `scope` lists the only repository-relative
  paths that may change. A path ending in `/` includes descendants.
- `exclusions` are repository-relative paths that may never change, even when a
  parent is in scope. `artifacts` must be in scope and must exist at verification.
- Paths are literal, normalized, repository-relative paths. Absolute paths,
  `..`, `.git`, and `.amanar/run` are forbidden. Globs are not supported.
- `authority.repositoryWrites` and `authority.liveEffects` are independent.
  `begin` requires repository-write authority. A check with `liveEffect: true`
  requires live-effect authority; repository-write authority never implies it.
- The contract author is trusted to classify `liveEffect` accurately. The
  controller enforces the declaration but does not infer external effects from
  an arbitrary shell command or provide a network, credential, or OS sandbox.
  Run contracts from untrusted authors only inside an independently contained
  environment.
- Commands are non-empty shell command strings run from the repository root.
  Authors must keep them non-interactive and secret-safe. The controller neither
  interpolates repository content nor performs implicit redaction.
- Every check declares an expected exit, required combined-output tokens, a
  timeout, a minimum test count, a parser, and whether it has a live effect.
  `minTests > 0` requires `unittest`, `pytest`, or `tap`; absent or ambiguous
  parser output fails closed.

## State and evidence

The states are `planned`, `implementing`, `blocked`, and `verified`. `validate`
is read-only. `begin` records the current Git/source baseline and moves a mutable
workflow from planned to implementing. `block` records a reason. `verify` is the
only route to verified and succeeds only from implementing with current receipts,
all artifacts present, and no out-of-scope or excluded change.

Each receipt binds the canonical workflow hash, canonical check-definition hash,
command, exit code, parsed test count, UTC timestamp, stored stdout/stderr
digests, and a source digest over every filesystem entry except `.git/` and
controller runtime state. Verification recomputes stored output digests and
acceptance from those files. Changing the contract, check, source, or stored
output after a check makes its receipt stale. Run all checks again after the
final source change.

Runtime files live under ignored `.amanar/run/`. Output artifacts are bounded
to the first 256 KiB per stream; digests cover exactly those stored bytes.
Receipts prove internal consistency with controller-produced local evidence.
They are not signatures and cannot prevent forgery by an actor with write access
to the same runtime directory. An organization may explicitly export reviewed
receipts into its own downstream evidence store, but Amanar does not export or
deploy them automatically.

Timeout handling stops the check process group, discovers and kills descendants
that detached with a new session, then reaps the launched process. This covers
observable descendants in the same process namespace at timeout. It is not an OS
sandbox and cannot contain a process that daemonizes, is reparented before the
timeout, or delegates work to an external service. Commands requiring that
boundary must run inside a separately managed container or sandbox.

## Controller discovery

The single supported opt-in discovery location is
`.amanar/kernel/amanar-workflow.ts`, with the exact release recorded in
`.amanar/kernel/VERSION`. Hosts invoke that file with Node (>=22) from the
repository root and confirm `--version` matches the pin. Global installation and
unpinned `PATH` discovery are outside the portable contract.

## CLI and stable exit codes

| Code | Meaning |
|---:|---|
| 0 | command succeeded |
| 2 | invalid or unsupported contract |
| 3 | required authority denied |
| 4 | check failed or timed out |
| 5 | stale evidence or scope violation |
| 6 | incomplete workflow or invalid state transition |
| 10 | controller/internal error |

The stable commands are `validate`, `begin`, `run-check <id>`,
`block --reason <text>`, `verify`, and `status --json`.

## Compatibility

Schema 1.0 rejects unknown fields. A future compatible controller may add a new
schema version, but it must continue accepting 1.0 without changing these
semantics. Host adapters may describe only discovery and CLI invocation. They
must not redefine authority, scope, states, checks, receipts, or acceptance.
