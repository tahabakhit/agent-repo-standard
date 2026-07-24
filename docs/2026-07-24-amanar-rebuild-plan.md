# Amanar rebuild plan — SOTA thin, Pi-first agent kit

Date: 2026-07-24 · Supersedes `2026-07-23-thin-agent-kit-implementation-plan.md` and
closes the "(re)plan" step of `2026-07-24-next-session-handoff.md`. Produced after a
fresh audit, four external research passes (harness repos, per-harness native
capabilities, long-running-loop patterns, agent knowledge/memory design), and a
decision interview. Not yet implemented — awaiting approval.

## Product thesis

Amanar is the thin, portable, **Pi-first** agent kit whose two promises are
**verification you can trust** (un-gameable, world-state verify-before-done) and
**honest multi-harness portability** (Pi + Claude Code first-class, Codex
best-effort). Positioned against the bloated bundles: the intelligence lives in the
checks and the native integration, not in added machinery.

The 2026 frontier is restraint + verification rigor + native depth, not capability
maximalism. Evidence: Anthropic removed RAG for agentic search; external verification
is a measured 2–3× quality lever (Cherny); Datadog's harness replaced code review as
the primary correctness source; the respected kits are thin (mattpocock ~45-line
skills), the heavy ones (superpowers, compiled-engine harnesses) are cautionary.

## Ratified decisions (from the interview — settled)

- **Ambition**: deep rebuild for a state-of-the-art tool; **Pole B** — rigor +
  Pi-native depth, thin. Autonomy/multi-agent is a later add-on, not the headline.
- **Primary use**: shareable product first; generality wins ties.
- **Differentiator**: trustworthy world-state verification **and** honest
  multi-harness portability, together.
- **Invocation**: model-invocable by default; **explicit-only for live-effect
  skills**. Drop the uniform explicit-only mandate and the exact-5 skill lock.
- **Verification core**: everything on the table for the *implementation*; the
  *validated principle* (runner owns begin/run-check/verify; grade world-state, not
  transcript) is kept and rebuilt better.
- **Loop role**: both greenfield and existing repos, with the runner enforcing scope
  and blast-radius per contract. Not unattended overnight burns.
- **Distribution**: managed plugin/extension per harness (subscribe), versioned,
  lockfile-pinned, CI drift-checked. No copy-paste vendoring.
- **Harness tiers**: Pi + Claude Code first-class; Codex best-effort, tier-labeled
  (ships `openai.yaml` sidecars; explicit-only path is fragile upstream).
- **Knowledge tool**: in scope for this rebuild. **Hybrid build** — adopt the `kb`
  CLI's proven schema/verbs/lifecycle as the spec, reimplement clean (portable CLI
  core + thin Pi extension wrapper). Not a bash fork, not Pi-only greenfield.
- **Knowledge storage**: markdown-in-git + YAML frontmatter + per-dir `_index.md` +
  agentic grep/link traversal. **No embeddings in v1**; optional rebuildable FTS
  sidecar only if keyword recall later misses.
- **Store scope**: both global and per-project, project overriding global.
  Config-driven (flag → env → project → user/XDG → ask-on-first-use); the store is
  self-describing (`.kb/config.yml` travels with the corpus; tool stays stateless).
- **Save flow**: full auto-save-and-commit behind **fail-closed** gates; targets the
  knowledge store, never the working code repo.
- **agent-eval**: rework Pi-first as the heavier eval/backpressure gate (CI / pre-PR),
  outside the inner loop.
- **synology-mcp**: move out of Amanar to Anẓar (estate/ops home).
- **Product home / name**: publish the Amanar repo, keep the name "Amanar." The
  `asturlab → amanar` remote rename is **gated** — needs explicit go at execution.

## Target architecture (proposal — was left to emerge in planning)

Kernel-centered verification spine, thin invocation-typed skills, native per-harness
adapters, a separate knowledge subsystem — all on one substrate (markdown-in-git),
one distribution channel (subscribe).

Keep three layers separate (the SOTA anti-spaghetti rule): **knowledge** (facts) ≠
**memory** (personal/session state) ≠ **skills** (procedures).

1. **Verification spine** (rebuilt `workflow/` core)
   - Deterministic controller: task-spec → `workflow.json` → validate → begin →
     run-check → verify, with receipts + JSON schema. Keep the determinism.
   - **Runner owns control flow**; grades world-state via `status`; `pass^k` gate.
   - **Un-gameable checks with teeth**: tests-are-sacred and no-placeholder guards
     enforced structurally, not by prompt. This is the differentiator's edge — a
     single-iteration win depends on the check being both world-state and un-gameable.
   - One host-invocation source of truth (Pi/Claude/Codex headless shapes).
2. **Skill layer** (thin, portable, invocation-typed)
   - Bodies speak **abstract actions**; a per-harness tool-map translates. Authoring
     discipline: token budget (≈180–450 target, ≤1000 hard), fixed section order,
     positive instructions (not negation), progressive disclosure via `references/`.
   - Model-invocable by default; explicit-only where there are live effects.
   - Keep/rebuild: `inquire` (framing), `design` (+ task-spec), `assure` (adversarial
     + evidence-citation), `workflow` (verification interface), `scaffold` (repo
     harness; likely user-invoked).
   - Add: `save-knowledge` (KB skill), `writing-skills` (authoring standard).
   - Retire: `orchestrate` (multi-phase is host-native).
   - Deferred/optional: `find-skills`, a router skill — add only if user-invoked
     skills accumulate.
3. **Native loading + in-session backpressure** (per-harness adapters)
   - Pi: ~60-line extension — `resources_discover` → `skillPaths`, one-time `context`
     bootstrap injection, and a `tool_call` deny-unless-evidence backpressure hook.
   - Claude Code: plugin + `PreToolUse` gate + subagents where useful.
   - Codex: generated `openai.yaml` sidecars (best-effort), tier-labeled.
   - One `SKILL.md` source at `.agents/skills/`; `@AGENTS.md` import bridge for
     Claude/Codex; generation + CI drift-check so mirrors can't diverge.
   - Layer checks by speed: fast sensors in-session; full/integration/security as
     outside gates.
4. **Knowledge subsystem** (new)
   - Portable CLI core (hybrid): save pipeline **secret-scan (pre-write) →
     schema-validate → dedup (archive-with-pointer) → link-check → index/log/manifest
     → commit**; maintenance verbs `validate` / `stale` / `doctor` / `compact` /
     `distill`; scheduled two-tier freshness audit.
   - Governance frontmatter: `id`, `type`, `title`, `description`, `status`, `tags`,
     `created`, `last_verified`, `ttl`, `confidence`, `sources` (url + sha256 of body
     + ingested), `provenance`.
   - Thin Pi extension wrapper for native UX; `save-knowledge` SKILL.md
     (model-invocable, full auto-commit behind the fail-closed gates).
   - Gitleaks pre-commit + CI as defense-in-depth on top of the pre-write scan.
5. **Eval gate** (reworked agent-eval) — Pi-first, wired as the heavier
   eval/backpressure gate at CI / pre-PR, not the inner loop.
6. **Packaging** — Pi package (`pi` key in `package.json`) primary; Claude plugin;
   Codex install (best-effort); lockfile + CI content-drift check. Publish the repo.

### Structure changes
- `workflow/` — verification spine (controller + loop + host shapes), reworked.
- `workflow/agent-eval/` — reworked Pi-first eval gate.
- skills — consolidate the set; per-skill invocation policy; generated Codex sidecars.
- `knowledge/` (new) — KB CLI core + Pi extension + `save-knowledge` skill.
- `harness/` — scaffold, backpressure, native loading adapters (Pi ext, Claude
  plugin, Codex sidecar generation).
- `storage/synology-mcp/` — **move out** to Anẓar.
- `workflow/tests/validate-workflow.py` — refactor: drop the exact-5 lock; validate
  **per-skill** invocation policy (SKILL.md flag ↔ generated `openai.yaml`) instead.

## Workstreams (parallelizable)

- **WS-A — Verification spine.** Rebuild controller + runner + host shapes +
  un-gameable checks; prove on Pi + Claude. *The differentiator; de-risks the rest.*
- **WS-B — Skill + invocation layer.** Consolidated skills, per-skill invocation,
  authoring discipline, abstract-action bodies + tool-maps, Pi-native loading +
  in-session backpressure adapters. Refactor the validator.
- **WS-C — Knowledge subsystem.** CLI core + schema + save pipeline + maintenance
  verbs + Pi extension + `save-knowledge` skill. Largely independent of A/B.
- **WS-D — Eval gate + packaging.** Rework agent-eval Pi-first; plugin/extension
  packaging, lockfile, CI drift + content-drift checks; README/positioning.
- **WS-E — Gated execution (needs explicit authority).** synology → Anẓar move;
  `asturlab → amanar` remote rename + repo publish. Not started without your go.

Dependencies: A and C run in parallel first. B follows A (skills reference the
verification interface) and adds the loading adapters. D wraps A/B/C. E is last and
gated.

## First slice (my call, per your delegation)

Ship **WS-A (verification spine) + the validator/invocation refactor from WS-B** as
the first coherent, testable slice — it is the differentiator and de-risks
everything downstream — and run **WS-C (knowledge subsystem)** in parallel, since it
is independent. Build via a Claude Workflow (ultracode), small fan-out, each
workstream verified before merge.

## Deliberately NOT building

Embedding/vector pipeline (violates freshness at this scale); a memory *runtime*
(Letta-style); hardcoded store paths; a bespoke skill registry (use git/npm +
lockfile); compiled/opaque guardrail engines; coercive always-on mega-bootstrap;
multi-agent orchestration for sequential work.

## Risks / watch-items

- Full auto-commit removes the human from the save loop — the gates are the only
  guardrail, so they must be fail-closed and well-tested. Contained blast radius
  (knowledge store only) mitigates.
- Codex explicit-only is fragile upstream (open bugs) — hence best-effort labeling.
- Cross-harness `SKILL.md` mirroring risks drift — mitigated by generation + CI check.
- "Deep rebuild" scope is large — the workstream split + first-slice keeps it bounded
  and shippable incrementally.
- Reset/compaction memory strategy is model-version-dependent — don't hard-code it.

## Attribution

Evidence-citation + handoff grafts are MIT from `iamneilroberts/claude-skills`. The
KB design draws on the Open Knowledge Format / `kb` CLI and Basic Memory patterns.
