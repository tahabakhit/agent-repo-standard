# Skills

All skills live under `skills/`, authored once and invocation-typed. Model-
invocable skills fire when they apply; explicit-only skills (live effect)
require explicit invocation. Every skill has an `agents/openai.yaml` sidecar and
an entry in the TS roster (`src/validators/roster.ts`) — the gate enforces both.

## Model-invocable

- **amanar-interview** — clarify an unclear idea into an accepted success
  contract. Grills the material decisions, offers 2–3 approaches, and gates on
  explicit acceptance; never begins implementation before the contract is
  accepted.
- **amanar-plan** — design a system from evidence: alternatives, failure
  analysis, migration, recovery, and tracer-bullet vertical slices that compile
  to controller contracts.
- **amanar-adversarial-review** — challenge readiness and completion evidence
  independently; classify findings blocker/material/advisory; red-green-refactor
  is the strongest evidence path.
- **amanar-remember** — capture reusable knowledge into the configured kb store.
- **amanar-author-skill** — author or revise a SKILL.md to kit standards.
- **amanar-essence** — strip reader-facing writing down to only what you mean.
  Also re-injected each turn as an always-on default; toggle with "stop essence"
  / "essence mode".
- **amanar-guide** — route a request to the right skill and sequence the work.
- **amanar-worktrees** — set up an isolated workspace before implementation
  (adapted from obra using-git-worktrees, MIT).
- **amanar-debug** — find a bug's root cause before attempting a fix (adapted
  from obra systematic-debugging, MIT).
- **amanar-discover** — search the skills.sh index, vet candidates at the source
  (license, freshness, safety — untrusted input), and shortlist; vendoring is
  user-authorized.
- **amanar-last30days** — research recent real-world signal on a topic,
  engagement-weighted, with citations.

## Explicit-only (live effect)

- **amanar-deliver** — route a material objective through the deterministic
  controller to verified. Completion is proven by controller receipts, never by
  narration.
- **amanar-onboard** — design, audit, or apply the smallest useful repository
  harness.

## Buckets

Non-promoted skills live off the validated surface in `skills/in-progress/` and
`skills/deprecated/`; the validators skip these directories.
