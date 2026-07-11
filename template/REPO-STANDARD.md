# Repo Standard

This repository follows a defined, AI-native layout. It is a **composition of
three mature, individually-defined standards** — not a bespoke framework. Each
owns one plane and they do not overlap. Follow it whether you are a human or an
agent; this file is committed so every collaborator has it in-repo.

| Plane | Standard | Owns |
|---|---|---|
| Agent instructions | [AGENTS.md](https://agents.md) | The entry file every agent reads first; principles + quality gates. |
| Human documentation | [Diátaxis](https://diataxis.fr) | `docs/{tutorials,how-to,reference,explanation}/`. |
| Decisions | [MADR / ADR](https://adr.github.io) | `docs/decisions/adrs/`. |

The committed tree is **tool- and host-agnostic**: it names no specific agent,
plugin, CLI, or workflow methodology. Any of those — a spec-driven toolchain, an
enforcement plugin, etc. — is a **per-developer, local choice** (see *Agent
setup* below), never part of the committed standard.

## The non-overlap principle

AGENTS.md owns **agent instructions + principles**. Diátaxis owns the
**human-docs** plane. MADR owns **decisions**. Nothing belongs in two places.
Do not reintroduce a parallel `.ai/` or per-tool documentation tree — that is
the failure mode this standard exists to prevent.

## Canonical tree

```
AGENTS.md                     # agent entry point (read first): principles, rules, quality gates
                              #   CLAUDE.md @-includes it for Claude Code
REPO-STANDARD.md              # this file
README.md                     # human entry point
CONTRIBUTING.md               # thin human contribution guide → points at AGENTS.md
.github/
  CODEOWNERS                  # review ownership (kept here, not at root)
  copilot-instructions.md     # Copilot entry → points at AGENTS.md
  ISSUE_TEMPLATE/             # bug_report, feature_request, config.yml
  pull_request_template.md    # PR checklist (verification, sensitive-data boundary, ADR)
docs/
  tutorials/                  # learning-oriented, step-by-step
  how-to/                     # task-oriented recipes / runbooks
  reference/                  # information-oriented: vocabulary, APIs, config
  explanation/                # understanding-oriented: rationale, background
  decisions/adrs/             # MADR decisions (NNNN-slug.md, never renumbered)
    archive/                  # retired ADRs, kept for history
  history/                    # dated point-in-time notes (context only)
data/                         # versioned source material; data/local/ is ignored
deliverables/                 # versioned final outputs
artifacts/                    # ignored generated or transient output
```

Code repos additionally carry `src/` + `tests/`; library repos add packaging.
Workspace repos carry no `src/`. Anything a local toolchain generates (local
spec/brainstorm working dirs, per-agent command surfaces, …) is git-ignored —
see *Agent setup*.

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
| A non-negotiable principle or quality gate | `AGENTS.md` (Principles / Quality Gates) |
| A learning walkthrough | `docs/tutorials/` |
| A "how do I X" recipe or runbook | `docs/how-to/` |
| Vocabulary, schema, API, config reference | `docs/reference/` |
| Versioned source material | `data/` |
| Restricted or bulky local input | `data/local/` (git-ignored) |
| Versioned final output | `deliverables/` |
| Generated or transient output | `artifacts/` (git-ignored) |
| Why something is the way it is (rationale) | `docs/explanation/` |
| A decision worth preserving past the work | `docs/decisions/adrs/` |
| A dated note kept only for context | `docs/history/` |
| Local specs / brainstorms / tool notes | local-only (git-ignored) — see *Agent setup* |

## Keep AGENTS.md lean

Instructions compete for attention — every line you add makes the others less
likely to be followed, and some harnesses silently truncate large files. So:

- Prefer the fewest, most load-bearing rules; push detail into `docs/` and
  reference it (`see docs/x.md`) rather than inlining.
- Make each rule **verifiable**, and give the alternative ("don't X → do Y").
- Reserve emphatic markers (NON-NEGOTIABLE / MUST / NEVER) for the few that matter.
- Reference `file:line` instead of pasting code (snippets go stale).

## Quality gate

No change is "done" until the repo's verification passes with fresh output
(defined in `AGENTS.md`). Markdown links must resolve and the canonical tree must
be intact — see `tests/` (or the scaffold audit) where present.

## Agent setup

The committed tree names no agent. Each contributor brings their own.

**Committed, shared entry files** — all tool-agnostic, all pointing at `AGENTS.md`:
`AGENTS.md` itself (read natively by most harnesses — Codex, Cursor, Copilot,
Windsurf, Cline, Roo, Amp, Zed, …), `CLAUDE.md` (`@AGENTS.md`, the bridge for
Claude Code, which does not read AGENTS.md directly), and
`.github/copilot-instructions.md`. Put principles/rules in `AGENTS.md` — it is the
one file auto-loaded across harnesses; there is no separate cross-harness "rules"
file.

**Local, never-committed agent context.** Tool-specific instructions (slash
commands, plugin/extension notes, current-plan pointers) belong in a git-ignored
local overlay, never in a committed entry file:

- `AGENTS.local.md` — the canonical local overlay (neutral; holds the actual notes).
- `CLAUDE.local.md` — `@AGENTS.local.md` (+ any Claude-only local). Claude Code
  auto-loads `CLAUDE.local.md`, which pulls in `AGENTS.local.md`; no committed
  reference is needed. Both are git-ignored by `*.local.md`.

**Local tooling (optional).** Any spec-driven or enforcement toolchain is a local
choice, installed and run per developer, never committed. Everything it generates
— local spec/brainstorm working dirs, per-agent command surfaces, enforcement
adapters — is git-ignored. Durable outcomes are promoted to ADRs, `docs/`, or
issues; remote carries no local specing or brainstorming. The committed tree does
not depend on the choice of toolchain.

## Provenance

Generated from the `agent-repo-standard` copier template. To adopt standard
changes later, re-run `copier update` from the repo root.
