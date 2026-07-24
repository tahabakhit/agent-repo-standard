# Amanar workflow

The workflow component provides four skill contracts plus the deterministic kernel:

- `amanar-workflow` (explicit-only): rigor routing over the controller
- `amanar-inquire` (model-invocable): problem framing and requirements
- `amanar-design` (model-invocable): adaptive cross-domain design
- `amanar-assure` (model-invocable): adversarial readiness and completion review

Invocation is per-skill: model-invocable by default, explicit-only for skills with
live effects (`amanar-workflow` drives the controller).

## Kernel

`kernel/` is the deterministic, host-independent controller (TypeScript). Consumers
vendor it at `.amanar/kernel/` and invoke `node .amanar/kernel/amanar-workflow.ts
validate|begin|run-check|verify|status`. See `kernel/docs/contract.md`. The loop's
`loop/src/hosts.ts` holds the shared, non-interactive invocation shapes for each
supported host.

## Hosts

Pi is the primary harness; Claude and Codex are secondary. Each runs the kernel by
calling the vendored `.amanar/kernel/amanar-workflow.ts` via node — the controller is
identical across hosts.

Pi (primary):

- **Headless:** `pi -p "<prompt>" --mode json --no-session --thinking <level>
  [--provider <p> --model <m>]`. `--no-session` gives fresh context per run;
  `--mode json` is machine-gradable.
- **Repo rules:** Pi auto-discovers `AGENTS.md` and `CLAUDE.md`
  (`--no-context-files` disables). The root `AGENTS.md` is Pi's instruction file;
  keep it lean.
- **Skills:** loaded from `~/.agents/skills/` and project `.agents/skills/`;
  `--skill <path>` / `--no-skills` control loading.
- **Invocation:** Pi honors the standard `disable-model-invocation` frontmatter
  (like Claude Code), so explicit-only skills are gated natively. Governed and loop
  runs additionally enforce it structurally with `pi --no-skills --skill <path>`
  (load exactly the intended skill).
- **Models:** default provider/model come from Pi settings; override with
  `--provider`/`--model`. Routing intent: GPT by default, Claude-on-Vertex as the
  secondary lane.

