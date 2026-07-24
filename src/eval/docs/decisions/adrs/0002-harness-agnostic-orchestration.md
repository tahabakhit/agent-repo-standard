# ADR-0002: Harness-agnostic orchestration with Pi as primary

## Status

Accepted

## Date

2026-07-24

## Context

ADR-0001 designated the current Codex task as the sole orchestrator. That was correct when agent-eval was first built as a Codex plugin, but the Amanar kit has since adopted a Pi-first direction. Agent-eval runs as the outside eval gate (CI / pre-PR), not inside any harness's inner loop. The deterministic Node recorder was already dependency-free and portable from day one; only the orchestration framing remained Codex-specific.

Three concrete gaps:

1. SKILL.md named Codex explicitly as the orchestrator, implying the skill could not be driven from Pi or Claude Code.
2. ADR-0001 stated "A current Codex task is required for orchestration" in its Consequences.
3. README.md described the entry point as "start in Codex."

None of the scoring, validation, rendering, or artifact-recording logic required Codex. The same `node scripts/agent-eval.mjs` CLI is identical regardless of which harness invokes it.

## Decision

Treat the current agent task as the orchestrator regardless of harness. Pi is the primary harness in the Amanar kit; Claude Code and Codex are also fully supported. SKILL.md, README.md, and this ADR now reflect that.

The one deterministic Node recorder (`scripts/agent-eval.mjs`) is unchanged: same CLI, same schema, same scoring formula, same confidence caps, same test suite (19 tests, all green). The dashboard still never executes commands.

Plugin Eval remains applicable only to Codex skills and plugins by design; that lane is not removed, only labeled explicitly as Codex-local.

`$agent-eval:evaluate-all` remains the plugin-installed invocation form for Codex and Claude Code. Pi invokes the same skill by task instruction rather than plugin namespace.

## Rationale for Pi-first

Pi is the designated primary harness in the Amanar agent-kit. Codex was used to bootstrap the initial specification; Pi is the intended production orchestrator going forward. Making Pi primary in the framing — rather than listed-but-secondary — aligns orchestration documentation with the kit's actual direction and costs nothing: no recorder logic changed.

## Alternatives considered

### Keep Codex as primary and add Pi as secondary

Rejected. The recorder is already harness-agnostic; only the framing was Codex-specific. The asymmetry of naming Codex primary while Pi is the kit's actual primary harness creates unnecessary drift.

### Remove Codex references entirely

Rejected. Codex remains a supported harness. Plugin Eval is Codex-local by design. Removing Codex would break an existing use case.

## Consequences

- The skill is invocable from Pi, Claude Code, or Codex without modification.
- Plugin Eval lane is labeled Codex-local in SKILL.md; it is skipped on other harnesses.
- ADR-0001 is superseded and carries a pointer to this document; it is not deleted.
- No changes to `scripts/agent-eval.mjs`, the test suite, or any run-record schema.
