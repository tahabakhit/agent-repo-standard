# Direction — Amanar as the thin, Pi-first agent-kit

Status: research complete · plan not yet built · 2026-07-23 · reconciles with the
pending `feat/thin-portable-kernel` fork / ADR-0001 and the workflow grafts spec
(`workflow/docs/reference/2026-07-23-skill-grafts-evidence-and-handoff.md`).

## Purpose

Seed for the **next session to build an implementation plan** for continuing to
build Amanar. It captures the mid-2026 research decision, an exists-vs-add gap
map against the current tree, the design constraints, and the open reconciliation
items. It is not itself the plan.

## Decision

Amanar **is** the "thin, portable, Pi-first agent-kit" the research recommends —
not a new repo. Reject bloated bundles (Superpowers, agentic-stack); keep a thin,
version-controlled instrument suite on portable standards (AGENTS.md < 150 lines +
portable SKILL.md + a bounded loop + backpressure gates), with `amanar-assure` as
the governance layer. Method over framework — the anti-framework expert consensus
(Ball, Ronacher, Steinberger, Horthy, Huntley, Zechner).

## Evidence base (committed research)

Full briefing in the Igoudar wiki, topic `agent-workflows` (commit `7c8456d`):

- `amegrad://igoudar/knowledge/topics/agent-workflows/wiki/references/coding-agent-harness-landscape-2026.md` — Pi vs Claude Code vs Codex + routing + the Codex-in-Pi verdict.
- `amegrad://igoudar/knowledge/topics/agent-workflows/wiki/theses/thin-portable-agent-kit-pi-first.md` — the thin-kit thesis (realized as Amanar).
- `amegrad://igoudar/knowledge/topics/agent-workflows/wiki/concepts/harness-engineering-governance-determinism.md`
- `amegrad://igoudar/knowledge/topics/agent-workflows/wiki/concepts/bounded-autonomous-work.md`
- `amegrad://igoudar/knowledge/topics/agent-workflows/wiki/references/setup-optimization-roi-ceiling.md`
- Raw source notes: `.../raw/notes/2026-07-23-harness-landscape-expert-research.md`, `.../2026-07-23-harness-deep-research-sonar.md`.

## What Amanar already has

- `harness/skills/amanar-scaffold` — repository scaffold.
- `workflow/skills/amanar-inquire` — inquiry/research.
- `workflow/skills/amanar-design` — design/planning.
- `workflow/skills/amanar-orchestrate` — phased execution.
- `workflow/skills/amanar-assure` — assurance/governance (blocker/material/advisory + independence).
- `workflow/skills/amanar-workflow` — umbrella lifecycle.
- `workflow/agent-eval` — Codex-native evaluation + deterministic runners.

## Gap map (exists vs add)

| Thin-kit element | Status in Amanar |
|---|---|
| `AGENTS.md` hard rules (< 150 lines) | exists — audit length, trim |
| research phase | exists — `amanar-inquire` (reconcile with RPI "Research") |
| plan phase | exists — `amanar-design` (reconcile with RPI "Plan"; add task-spec template) |
| implement phase (worktree) | exists — `amanar-orchestrate` (add worktree-isolation + per-phase compaction) |
| assure / governance gate | exists — `amanar-assure` |
| repo scaffold | exists — `amanar-scaffold` |
| eval-as-gate | exists — `workflow/agent-eval` (wire as CI/backpressure gate) |
| **bounded-loop runner** (Ralph-style, fresh context, one task/loop, harness-swappable pi/claude) | **ADD** |
| **backpressure pre-commit hook** (tests+lint+validate must pass) | **ADD** |
| **cross-harness `sync-skills`** (symlink SKILL.md → Pi `.agents/skills`, Claude `~/.claude/skills`, Codex) | **ADD** |
| **RPI/QRSPI task-spec template** (GOAL / DONE-WHEN exits-0 / SCOPE / VERIFY / BLAST-RADIUS) | **ADD** (as a reference under `amanar-design`/`amanar-orchestrate`) |

Do NOT add parallel `research`/`plan`/`implement` skills — reconcile RPI phases
onto the existing `inquire`/`design`/`orchestrate` skills.

## Design constraints (from the research)

- **Routing** (see landscape article): Pi = default governed daily driver; native
  Codex CLI = GPT-5.6-heavy autonomous runs only (Programmatic Tool Calling;
  Pi's local "Code Mode" wrapping is unbenchmarked); Claude = in Pi (cost-neutral
  on Vertex) or native Claude Code for deep multi-file/native-subagent work.
- **Determinism**: structural backpressure over model cleverness; fresh-context
  loops; reproducible environments precede reproducible agents.
- **Governance**: own control flow in deterministic code; human approval as a
  structured step; small focused agents (blast-radius); git-as-audit-trail.
- **Bounded autonomy**: "a loop is a task with a check"; grade world-state not
  transcript; gate on `pass^k`; loop only mechanical/verifiable work.
- **ROI ceiling**: keep it thin — config > ~150 lines, bespoke tool schemas, and
  multi-agent orchestration for sequential work are net-negative (Ronacher
  model-drift risk; Google topology study). Extend, don't rebuild.

## Reconciliation items for the plan

1. **`feat/thin-portable-kernel` fork / ADR-0001** — resolve before adding new
   surface; this direction should land as (or on top of) that kernel, not beside it.
2. **RPI ↔ existing skills** — decide exact mapping of Research/Plan/Implement to
   `amanar-inquire`/`amanar-design`/`amanar-orchestrate`; add worktree isolation +
   per-phase compaction to orchestrate.
3. **Where the loop runner lives** — `harness/` vs `workflow/` — and its component
   entry in `components.yaml` + a validator.
4. **Pi top-level instruction-file hookup** — confirm where Pi loads repo-level
   rules (skills already load from `.agents/skills/`).
5. **agent-eval as the backpressure/eval gate** — wire it into the pre-commit hook
   and the loop's continue-condition.
6. **Attribution** — the handoff/curator grafts (grafts spec) are MIT from
   `iamneilroberts/claude-skills`; keep attribution.

## Next session

Build the implementation plan from this note: order the ADDs behind the
`feat/thin-portable-kernel` resolution, define each new component's path +
`components.yaml` entry + validator, and keep every addition inside the ROI-ceiling
constraints above.
