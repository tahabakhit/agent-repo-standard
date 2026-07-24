# Next-session handoff — Amanar reset: audit → research → interview → (re)plan

Date: 2026-07-24 · Supersedes the `2026-07-23-thin-agent-kit-implementation-plan.md`
build direction. The next session starts with an audit, deep external research, and
heavy user interviewing, and is **explicitly authorized to refactor Amanar** — recent
work ran on an unratified assumption.

## Goal (unchanged)

Amanar as the thin, **Pi-first** agent-kit: portable, shareable, adaptable to each
harness's **native** capabilities (Pi primary; Claude Code and Codex when possible;
Hermes where it fits). Includes a config-driven knowledge-save tool and a library of
transferable cross-agent skills. Amanar stays packageable with no references to
locally-controlled repos.

## Assumptions to challenge (do not carry forward unexamined)

1. **Explicit-only vs model-invocable.** Recent work treated "all Amanar skills are
   explicit-only" as convention and let `workflow/tests/validate-workflow.py` enforce
   `disable-model-invocation: true` + `allow_implicit_invocation: false` on all five
   skills. This was never a ratified global mandate. Re-derive the invocation model
   **per harness native mechanism** (Claude `disable-model-invocation`; Codex
   `allow_implicit_invocation`; Pi skill triggering / native features) and **per
   skill**. Revisit whether the workflow validator should enforce it.
2. **`synology-mcp` placement.** A Synology DSM MCP in the portable-tools repo is the
   wrong home — it is estate/ops-flavored and likely belongs in Anẓar or its own repo.
   Decide with the user.
3. **Legacy asturlab-era decisions.** Audit for rigidity/debt: the hard 5-skill set
   lock; the explicit-only assumption; `agent-eval` being Codex-native rather than
   Pi-first; the kernel-vs-skills relationship; the retained `amanar-orchestrate`
   stub; component boundaries. Flag anything fighting the Pi-first, native direction.
4. The knowledge-tool / skill-library design in the 2026-07-23 plan is a starting
   point, not settled — re-validate after research and interviews.

## Agenda (in order)

1. **Quick audit** — components, validators, skills, kernel/loop, and the
   placement/boundary issues above → a short keep / move / refactor list.
2. **Deep external research** (fetch + synthesize; extend prior notes):
   - Repos: `github.com/Chachamaru127/claude-code-harness`,
     `github.com/Gentleman-Programming/gentle-pi`, `github.com/aryaniyaps/ultimate-pi`,
     `github.com/mfittko/dev-loops`; `obra/superpowers` (extract patterns, don't
     copy); Matt Pocock's skills.
   - Anthropic: `anthropic.com/engineering/harness-design-long-running-apps`.
   - Docs for NATIVE capabilities: Claude Code, Pi (`pi.dev/docs/latest`), Codex.
   - Broaden: agent loops, harness engineering, long-running-agent patterns.
3. **Interview the user hard** — ask many questions during research and planning;
   surface every decision before implementation, not during it.
4. **(Re)plan**, open to refactor, then implement.

## Process directives (from the user)

- Interview heavily in research + planning; prefer upfront questions over
  mid-implementation decisions.
- Be open to refactor; treat nothing as fixed.
- Pi is the main tool, on its native capabilities; Claude Code and Codex when
  possible.

## Inherited state

- **Amanar `main`** (local, unpushed — remote is the gated `asturlab.git`): commits
  `aa9cb6f` → `98c1bc6` added the Pi host adapter + pack `--effort`
  (`workflow/hosts.py`), thin `amanar-workflow` adapter + `render_handoff`,
  `amanar-orchestrate` stub, `amanar-assure` evidence-citation, task-spec compiler,
  bounded-loop runner (`workflow/loop/`), backpressure hook (`harness/backpressure/`),
  sync-skills (`harness/sync-skills/`). Built under the questioned assumptions — fair
  to revisit.
- **Measured fact worth keeping**: single-shot kernel completion is flaky at
  low/medium effort; the bounded-loop runner (runner owns begin/run-check/verify)
  reached `verified` in one iteration on both hard portability-pack tasks. Grade
  world-state, not transcript. Evidence: `workflow/docs/2026-07-23-pi-portability-pack-result.md`.
- **Related docs**: `docs/2026-07-23-thin-agent-kit-direction.md`,
  `docs/2026-07-23-thin-agent-kit-implementation-plan.md`.

## Prior research digest (extend, verify against the URLs above)

- **KB design**: for a solo dev, small/medium git corpus, multi-agent — structured
  markdown + YAML frontmatter + per-directory `_index.md` + agentic grep/link
  traversal beats RAG. Config-driven KB location (env + ask-on-first-use), no
  hardcoded repo. Guardrail save flow: schema → dedup (archive-with-pointer) → secret
  scan → link check → index/log → commit. Governance frontmatter: `description`,
  `sources` + `sha256`, `last_verified`.
- **Skills**: substrates are AGENTS.md (always-on) + SKILL.md (on-demand). Backbone
  loop: prime → explore-before-edit/plan → verify-before-done → capture → handoff.
  Avoid: multi-agent parallel writers; ungrounded self-critique; recursive in-place
  compaction as the only strategy; heavyweight spec-kit ceremony; auto-generated or
  bloated context files.

## Questions to open the interview

- Per-harness invocation model: which skills auto-trigger vs explicit, on Pi vs Claude
  vs Codex? Which Pi native skill/loop/hook primitives to build on?
- Does `synology-mcp` leave Amanar, and where to?
- How far to refactor: keep the kernel/loop, or rethink around Pi-native loops?
- First shippable slice after re-planning.
- Where the skill library and knowledge tool live post-audit.
