# Repo Standard

This repository follows a defined, AI-native layout. It is a **composition of
four mature, individually-defined standards** — not a bespoke framework. Each
owns one plane and they do not overlap. Follow it whether you are a human or an
agent; this file is committed so every collaborator has it in-repo.

| Plane | Standard | Owns |
|---|---|---|
| Agent instructions | [AGENTS.md](https://agents.md) | The entry file every agent reads first. |
| Spec-driven workflow | [spec-kit](https://github.com/github/spec-kit) + spex | `.specify/` principles + `specs/NNN-feature/` work. |
| Human documentation | [Diátaxis](https://diataxis.fr) | `docs/{tutorials,how-to,reference,explanation}/`. |
| Decisions | [MADR / ADR](https://adr.github.io) | `docs/decisions/adrs/`. |

## The non-overlap principle

AGENTS.md + spec-kit own the **agent/workflow** plane. Diátaxis owns the
**human-docs** plane. MADR owns **decisions**. Nothing belongs in two places.
Do not reintroduce a parallel `.ai/` or per-tool documentation tree — that is
the failure mode this standard exists to prevent.

## Canonical tree

```
AGENTS.md                     # agent entry point (read first); CLAUDE.md @-includes it
REPO-STANDARD.md              # this file
README.md                     # human entry point
CONTRIBUTING.md               # thin human contribution guide → points at AGENTS.md
.specify/
  memory/constitution.md      # non-negotiable principles + quality gates (committed)
specs/                        # per-feature spec/plan/tasks via /speckit-specify
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

## What goes where

| You are writing… | Put it in… |
|---|---|
| Instructions an agent must follow | `AGENTS.md` |
| A non-negotiable principle or quality gate | `.specify/memory/constitution.md` |
| A rough idea you want to shape into work | `/speckit-spex-brainstorm` → `specs/NNN-feature/` (no `brainstorms/` folder) |
| A per-feature spec / plan / tasks | `specs/NNN-feature/` (via `/speckit-specify`) |
| A learning walkthrough | `docs/tutorials/` |
| A "how do I X" recipe or runbook | `docs/how-to/` |
| Vocabulary, schema, API, config reference | `docs/reference/` |
| Why something is the way it is (rationale) | `docs/explanation/` |
| A decision worth preserving past the work | `docs/decisions/adrs/` |
| A dated note kept only for context | `docs/history/` |

## Quality gate

No change is "done" until the repo's verification passes with fresh output
(defined in `.specify/memory/constitution.md`). Markdown links must resolve and
the canonical tree must be intact — see `tests/` (or the scaffold audit) where
present.

## Provenance

Generated from the `agent-repo-standard` copier template. To adopt standard
changes later, re-run `copier update` from the repo root.
