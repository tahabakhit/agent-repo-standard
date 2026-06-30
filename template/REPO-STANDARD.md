# Repo Standard

This repository follows a defined, AI-native layout. It is a **composition of
four mature, individually-defined standards** — not a bespoke framework. Each
owns one plane and they do not overlap. Follow it whether you are a human or an
agent; this file is committed so every collaborator has it in-repo.

| Plane | Standard | Owns |
|---|---|---|
| Agent instructions | [AGENTS.md](https://agents.md) | The entry file every agent reads first. |
| Spec-driven workflow | spec-driven development | `CONSTITUTION.md` principles + `specs/NNN-feature/` work. |
| Human documentation | [Diátaxis](https://diataxis.fr) | `docs/{tutorials,how-to,reference,explanation}/`. |
| Decisions | [MADR / ADR](https://adr.github.io) | `docs/decisions/adrs/`. |

## The non-overlap principle

AGENTS.md + the spec-driven workflow own the **agent/workflow** plane. Diátaxis owns the
**human-docs** plane. MADR owns **decisions**. Nothing belongs in two places.
Do not reintroduce a parallel `.ai/` or per-tool documentation tree — that is
the failure mode this standard exists to prevent.

## Canonical tree

```
AGENTS.md                     # agent entry point (read first); CLAUDE.md @-includes it
REPO-STANDARD.md              # this file
README.md                     # human entry point
CONTRIBUTING.md               # thin human contribution guide → points at AGENTS.md
CONSTITUTION.md               # non-negotiable principles + quality gates
.github/
  CODEOWNERS                  # review ownership (kept here, not at root)
  copilot-instructions.md     # Copilot entry → points at AGENTS.md
  ISSUE_TEMPLATE/             # bug_report, feature_request, config.yml
  pull_request_template.md    # PR checklist (verification, sensitive-data boundary, ADR)
brainstorm/                   # brainstorm docs (NN-*.md + 00-overview.md)
specs/                        # per-feature spec/plan/tasks
docs/
  tutorials/                  # learning-oriented, step-by-step
  how-to/                     # task-oriented recipes / runbooks
  reference/                  # information-oriented: vocabulary, APIs, config
  explanation/                # understanding-oriented: rationale, background
  decisions/adrs/             # MADR decisions (NNNN-slug.md, never renumbered)
    archive/                  # retired ADRs, kept for history
  history/                    # dated point-in-time notes (context only)
```

Code repos additionally carry `src/` + `tests/`; library repos add packaging.
Data repos carry their data surface at the root and no `src/`.

## File naming

- **Root landmark / meta files → UPPERCASE:** `README`, `AGENTS`, `CLAUDE`,
  `CONTRIBUTING`, `REPO-STANDARD` (the well-known all-caps repo files only).
- **All other docs content → kebab-case:** e.g. `ai-readiness-playbook.md`,
  `snowflake-setup.md`.
- **ADRs:** `NNNN-slug.md` (never renumbered). **History:** `YYYY-MM-DD-slug.md`.

## What goes where

| You are writing… | Put it in… |
|---|---|
| Instructions an agent must follow | `AGENTS.md` |
| A non-negotiable principle or quality gate | `CONSTITUTION.md` |
| A rough idea you want to shape into work | `brainstorm/NN-*.md`, then a spec in `specs/` |
| A per-feature spec / plan / tasks | `specs/NNN-feature/` |
| A learning walkthrough | `docs/tutorials/` |
| A "how do I X" recipe or runbook | `docs/how-to/` |
| Vocabulary, schema, API, config reference | `docs/reference/` |
| Why something is the way it is (rationale) | `docs/explanation/` |
| A decision worth preserving past the work | `docs/decisions/adrs/` |
| A dated note kept only for context | `docs/history/` |

## Quality gate

No change is "done" until the repo's verification passes with fresh output
(defined in `CONSTITUTION.md`). Markdown links must resolve and
the canonical tree must be intact — see `tests/` (or the scaffold audit) where
present.

## Agent setup

The committed tree is **tool- and host-agnostic**: it carries the structure
(`AGENTS.md`, `CONSTITUTION.md`, `specs/`, `docs/`) but names no specific agent,
plugin, or CLI. The actual agent tooling is a **per-developer, local choice** —
materialized on each clone and git-ignored, never pushed. This keeps the repo
from prescribing one workflow to every collaborator.

**Committed, shared entry files** — all tool-agnostic, all pointing at `AGENTS.md`:
`AGENTS.md` itself (universal), `CLAUDE.md` (`@AGENTS.md`), and
`.github/copilot-instructions.md`.

**Local, never-committed agent context.** Tool-specific instructions (slash
commands, plugin/extension notes, current-plan pointers) belong in a local file
your agent auto-loads but git ignores — never in a committed entry file:

- **Claude Code** auto-loads `CLAUDE.local.md` at the repo root (git-ignored via
  the `*.local.md` rule) with no committed reference needed — put your
  spec-tooling command notes there.
- For other agents that read `AGENTS.md`, use an equivalently git-ignored
  `AGENTS.local.md` referenced only from local config.

**Local materialization.** Everything an agent/spec toolchain *generates*
(command surfaces, `.specify/` / `.claude/` machinery, enforcement adapters) is
git-ignored. The canonical principles live in committed `CONSTITUTION.md`; a
toolchain that expects them at its own path gets a **git-ignored symlink** back
to the root file, so the single source of truth stays tool-agnostic:

```bash
mkdir -p .specify/memory
ln -sf ../../CONSTITUTION.md .specify/memory/constitution.md
```

**Reference tooling (optional).** The reference implementation of the
spec-driven plane is [spec-kit](https://github.com/github/spec-kit) plus the
spex plugin layer, installed and run **locally per developer**, not committed.
Materialize it with the toolchain's own setup — for spec-kit,
`specify init --here --integration <claude|copilot|codex>` (then create the
constitution symlink above) — or use any equivalent spec-driven toolchain. The
committed tree does not depend on the choice.

## Provenance

Generated from the `agent-repo-standard` copier template. To adopt standard
changes later, re-run `copier update` from the repo root.
