# Amanar

Amanar is a portable, Pi-first agent-kit: one TypeScript package that bundles the
skills, hooks, and tools coding agents need, organized around what an agent
consumes rather than internal build components. It supports Pi and Claude Code
first-class and Codex best-effort.

The kit is a single Claude Code plugin rooted at the repository root, a single Pi
extension, and one `bin/amanar` CLI that every hook and tool funnels through.

## Layout

```
.claude-plugin/   plugin.json + marketplace.json (self-marketplace, source "./")
hooks/hooks.json  PreToolUse backpressure gate → bin/amanar hook
pi/               Pi extension (native skill loading, light bootstrap, backpressure)
skills/           all amanar-* skills, authored once, invocation-typed
bin/amanar        one CLI: validate · hook <name> · sync-skills · hooks install
src/              shared TypeScript library
  kernel/         self-contained copyable workflow controller (vendored to .amanar/kernel/)
  loop/           bounded-loop runner that drives the controller
  knowledge/      portable knowledge-save CLI (writes only to the configured store)
  eval/           evaluation recorder + records
  classify.ts     shared backpressure deny rules (single source of truth)
  hooks/  sync/  validators/  cli/
```

## Skills

| Skill | Invocation | Purpose |
|---|---|---|
| `amanar-interview` | model-invocable | Clarify an unclear idea into a verifiable success contract |
| `amanar-plan` | model-invocable | Design a system from evidence, alternatives, and failure analysis |
| `amanar-adversarial-review` | model-invocable | Independently challenge readiness and completion evidence |
| `amanar-remember` | model-invocable | Capture reusable knowledge into the configured store |
| `amanar-author-skill` | model-invocable | Apply the kit skill-authoring discipline to a SKILL.md |
| `amanar-deliver` | explicit-only | Route a material objective through the deterministic controller to verified |
| `amanar-onboard` | explicit-only | Design, audit, or apply the smallest useful repository harness |

Live-effect skills are explicit-only; the rest are model-invocable by default.
Six more model-invocable skills — `amanar-essence`, `amanar-guide`,
`amanar-worktrees`, `amanar-debug`, `amanar-discover`, `amanar-last30days` —
round out the promoted set. See [docs/skills.md](docs/skills.md).

## Documentation

- [docs/skills.md](docs/skills.md) — every skill and when it fires.
- [docs/architecture.md](docs/architecture.md) — enforcement layers, capability
  gating, native-tool adaptation, injection.
- [docs/eval.md](docs/eval.md) — the five-suite regression harness (`bin/amanar eval`).
- [docs/config.md](docs/config.md) — templates, private overlay, and install.

## Enforcement

The kit's value is the forcing layer, not the advice: safety, verification, and
completion never depend on the model choosing to comply. A runner owns the loop
and gates "done" on external evidence; a single dispatcher (`bin/amanar hook`)
applies hard deny/completion gates; injection keeps the active checklist in
front of the model. See [docs/architecture.md](docs/architecture.md).

## Compatibility

The signed tag `legacy-fixed-v1.0.11` (commit `9feb596`) preserves the final
fixed generator interface. It is retained for history only and is not a current
Amanar interface.

## Install

See [INSTALL.md](INSTALL.md).

## Validation

```sh
make validate
```
