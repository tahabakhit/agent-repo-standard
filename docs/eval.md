# Eval

`bin/amanar eval` runs the regression harness — five suites, Inspect-AI shape
(Dataset → Task → Solver → Scorer). It reuses the deterministic kit internals as
solvers, so it grades without a live model. It exits non-zero on any failure and
runs in CI (`.github/workflows/eval.yml`), kept out of `make validate`.

Cases are JSON under `src/eval/cases/<suite>/`.

## Suites

1. **invocation** — deterministic routing hits the right skill, and misfire
   negatives route to nothing.
2. **procedure** — each skill's SKILL.md carries its procedure invariants (e.g.
   the controller order, the explicit-only clause).
3. **verify-gate** — the differentiator. Seed a tampered test, placeholder code,
   and an unmet world-state, and assert the guards and verification gate BLOCK
   each; a clean-verified control must NOT block. Mutation testing of the gate.
4. **model-tier** — recorded tier scores do not regress with capability.
5. **harness-parity** — the shared classifier decides identically for every
   harness.

The framework and the mutation suite are unit-tested inside `make validate`; the
full five-suite run is the CI job. The eval recorder (`src/eval/recorder.ts`) is
the deterministic recorder for eval runs.
