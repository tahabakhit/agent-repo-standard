# Spec — evidence-citation + handoff grafts from claude-skills

Status: proposed · 2026-07-23 · Decision-aware (does not resolve, but reconciles
with, the pending `feat/thin-portable-kernel` fork / ADR-0001).

## Why

A measured functional eval (paired trials, real runs) of `iamneilroberts/claude-skills`
vs Asturlab:

- **Confabulation catch** — `curate`/`curator` scored 5/5 evidence (caught 3/3
  claims, cited the exact falsifying line, ran headless under `claude -p`);
  `amanar-assure` caught the same contradictions but scored 3/5 — no contract
  to quote the falsifying command/output, no per-claim verdict vocab.
- **Handoff artifact** — iamneilroberts `handoff` 23/25 vs Asturlab close-out
  18/25; its edge is self-expiring "stale-if" receipts, a verbatim id/path/SHA
  closet, and a checklist-rebuild that makes resume mechanical.

Lift those two purpose-built strengths into Asturlab's governed spine. Patterns
reimplemented from `iamneilroberts/claude-skills` (MIT — attribution retained);
this is a pattern reimplementation, not a file copy. `task-observer` (CC BY 4.0)
and `unslop-ui` (upstream-derived) are deliberately not used.

## Graft 1 — evidence-citation cardinal rule → `amanar-assure` (architecture-stable)

Add to `workflow/skills/amanar-assure/SKILL.md`, after the independence-disclosure
sentence:

> No evidence, no verdict. Every finding cites the exact command run and its
> output. When checking discrete claims, classify each VERIFIED / CONTRADICTED /
> UNVERIFIED and pin the citation to the file:line or command that settles it.

- **Placement:** on `main`, immediately after "...only self-review was
  available." On the kernel branch, immediately after the added controller-boundary
  paragraph. Frame it as `assure`'s own *finding-evidence discipline* — it does
  not duplicate or override kernel controller gates (honours the branch's
  boundary line). VERIFIED/CONTRADICTED/UNVERIFIED is the narrative complement to
  the kernel's deterministic pass/fail receipts (assure judges claims/design; the
  kernel judges checks). No conflict either way.
- **Portability:** prose-only; no host terms; ~6 lines. If it needs to grow, move
  detail to `references/evidence.md` to respect the branch's skills-prose line
  budget.
- **Acceptance:** an `assure` claim-check produces a per-claim table citing the
  settling command/output; `make validate` passes.
- **Fork dependency:** none. **Land this now** — cheap, stable, highest measured
  value.

## Graft 2 — handoff/resume pattern (host flips on the fork)

Three elements: (a) **stale-if receipts** — durable claims pinned to exact
refs (SHA/PR/path) with explicit invalidation conditions; (b) **coordinate
closet** — a deduped verbatim id/path/SHA ledger; (c) **checklist-rebuild** — a
block that lets a fresh session reconstruct state mechanically.

Key reconciliation: **the deterministic form of (a) already exists on the kernel
branch.** `workflow/kernel/amanar_workflow/receipts.py` binds
{workflow hash, check-def hash, command, exit, test count, timestamp, stdout/stderr
digests, source digest} and marks a receipt STALE when the contract, check,
source, or output changes. Do not reinvent it — surface it.

### Track A — if `main` / merged-remediation is chosen

Graft into `amanar-orchestrate` §8 "Close the outcome" (it still exists here):

- Add "stale-if receipts" and a "coordinate closet" to the §8 `Report:` list.
- Add a checklist-rebuild block to §1 "Bootstrap automatically" (resume path),
  back-referenced from §8.
- Keep "using existing project conventions" — add *structure*, not a mandated
  file format (portability). Put any template in `references/handoff.md`.

### Track B — if `feat/thin-portable-kernel` is chosen

`amanar-orchestrate` becomes a deprecated stub — do **not** graft there.
Instead:

- Element (a) = the kernel's receipts; already deterministic. Surface it.
- Extend `amanar-workflow`'s recipe with a **resume-digest render**: from
  `status --json` + receipts, emit a human handoff listing state
  (planned/implementing/blocked/verified), current vs **stale** receipts (the
  machine-checked "stale-if"), an id/artifact closet drawn from the contract's
  `artifacts`/`scope`, and a checklist-rebuild from remaining checks.
- The kernel deliberately owns no handoff UX, so this is a correct *additive*
  home. Prefer a small `status --json`→markdown render step + `references/handoff.md`
  over inline prose (line budget). A separate `amanar-handoff` instrument is
  possible but expands the six-instrument surface — extend `amanar-workflow`
  first.

## Cross-cutting (both grafts)

- **Authority routing:** the portable skill/pattern lives in Asturlab; concrete
  operational handoffs (e.g. Maydan's Mogador session-handoff) stay in Maydan and
  *use* the skill. No deployment state, hostnames, or creds enter Asturlab.
- **Explicit-invocation:** keep/restore Claude frontmatter
  `disable-model-invocation: true` (the kernel branch currently drops it on all
  five skills — dropping it weakens Claude explicit-only enforcement; recommend
  restoring). Keep Codex `agents/openai.yaml allow_implicit_invocation: false`;
  Pi relies on the description prose ("Use only when explicitly invoked.").
- **Validation:** `make validate` + `git diff --check`. On the branch, also the
  expanded `validate-workflow.py` (schema host-term ban, canonical-adapter
  byte-identity, skills-prose line budget, per-skill migration decision) — keep
  additions terse and out of the schema.

## Optional follow-on (from the eval bake-off, separate)

Add an ADOPT / LIFT / SKIP **quick-mode verdict shape** to `agent-eval` as a
lightweight front-end to its measured 9-axis run — borrowed from iamneilroberts's
`evaluate`. Independent of the two grafts.

## Sequencing

1. **Resolve the kernel fork (ADR-0001)** — prerequisite for Graft 2; its host
   flips entirely between the two tracks.
2. **Land Graft 1 now** — stable, cheap, highest measured value.
3. **Land Graft 2** on the chosen host.
4. (Optional) `agent-eval` quick-mode.
