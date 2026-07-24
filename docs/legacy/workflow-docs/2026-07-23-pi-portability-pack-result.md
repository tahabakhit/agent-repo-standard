# Pi five-task portability pack — first measured result

Date: 2026-07-23 · Pi 0.81.1 · WS0 checkpoint of the thin-agent-kit plan.

## Setup

`workflow/hosts.py` gained a `pi` invocation shape; `run-portability-pack.py`
imports it. Run:

```sh
python3 workflow/tests/run-portability-pack.py --host pi --mode both
```

Model `openai-codex/gpt-5.6-sol`, thinking `low`, fresh context per run
(`--no-session`), JSON output. An unqualified model id must be provider-qualified —
a bare `gpt-5.6-sol` fuzzy-matches to the unauthed `azure-openai-responses`
provider and fails at startup; `hosts.py` prefixes `openai-codex/`.

## Result: 8/10 accepted

| task | native | kernel |
|---|---|---|
| task1-bounded | pass | pass |
| task2-review | pass | pass |
| task3-recovery | pass | **fail** |
| task4-authority | pass | **fail** |
| task5-ownership | pass | pass |

All five native runs pass. Kernel path: 3/5.

## Root cause of the two kernel misses

Both failures report "kernel workflow is not currently verified." Neither is a
kernel defect, a task-design flaw, or a substantive-work failure:

- **The work was done correctly.** task3 fixed `slug.py`; task4 scaled
  `config/service.yml` to two replicas and wrote `migration-plan.md` with rollback,
  without running `deploy.sh` (no `LIVE_EFFECT_RAN` — authority respected).
- **Receipts were present and passing** — `AMANAR_CHECK tests PASS tests=4` and
  `AMANAR_CHECK acceptance PASS tests=0`.
- **The workflow was left at `implementing`, not `verified`.** The agent
  (gpt-5.6-sol at low effort) never issued the final `verify`, and the token trace
  shows it mis-invoking the CLI: `status` without the required `--json`, a check
  before `begin`. The kernel rejected each with correct stable exit codes (6, 2).

Decisive check: running `python3 .amanar/kernel/amanar-workflow verify` once in each
stuck run directory returned `AMANAR_VERIFIED` (exit 0) and `status: verified` with
no other change. The state was one command away — the substantive work and receipts
were complete.

## Implications

- The kernel behaved correctly across all ten runs; ADR-0001's host-independence
  holds for Pi.
- The gap is host-behavioral reliability on the multi-step CLI sequence at low
  effort. Two levers, both already in the plan:
  1. **WS1.1** — the thin-adapter `amanar-workflow` SKILL that spells out the
     `validate → begin → run-check → verify` recipe (the run used the pre-slimming
     skill). Re-measure the pack after WS1.1.
  2. Reasoning effort ≥ medium for kernel completion, if low proves persistently
     unreliable on the final transition.

## WS1.1 re-measurement (thin adapter + effort)

After rewriting `amanar-workflow` as a thin controller adapter with the explicit
`validate → begin → run-check → verify` recipe, and adding a `--effort` parameter to
the pack:

| effort | native | kernel |
|---|---|---|
| low | 5/5 | 3/5 → 4/5 → 3/5 (flaky) |
| medium | — | 4/5 |

Two findings:

1. **Final-`verify` completion is flaky at low effort.** The kernel score varied
   3–4/5 across identical low-effort runs; every miss left the workflow at
   `implementing` (work done, receipt passing, `verify` never issued). The lever is
   reasoning effort plus the bounded-loop runner's continue-until-`verified` retry —
   a single `pi -p` shot was never the production path. Not addressable by more skill
   prose.
2. **task4-authority is an authority-vs-completion judgment case.** Its explicit
   "not authorized" framing pushes the model to `block` a workflow whose own
   acceptance is met (prep complete, check passing, no live effect). A skill line —
   "block only when this workflow cannot reach its own acceptance; downstream work
   being unauthorized is a fact to report, not a reason to block" — reduced it, but
   medium effort re-triggered blocking. Every failure recovered to `verified` with
   `begin`/`verify`; the kernel and task design are sound. Flagged for the loop
   runner (WS2.1) and possibly stronger `amanar-assure` guidance.

The controller reached `verified` correctly whenever the agent issued the commands;
no run produced a wrong receipt, a scope violation, or a live effect.

## Known gap (follow-up)

`run-portability-pack.py::token_usage()` matches `input_tokens`/`output_tokens`/
`cached_input_tokens`; Pi's JSON uses `input`/`output`/`cacheRead`/`totalTokens`, so
Pi cost is recorded as `null`. Add a Pi-shaped parse path (keyed on `totalTokens` +
`provider` to avoid matching the generic `input`/`output` keys elsewhere).
