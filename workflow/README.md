# Amanar workflow

The workflow component provides five explicit contracts:

- `amanar-workflow`: stateful umbrella and rigor routing
- `amanar-inquire`: problem framing and requirements
- `amanar-design`: adaptive cross-domain design
- `amanar-orchestrate`: phased execution and verification
- `amanar-assure`: adversarial readiness and completion review

The contracts are portable and do not assume that one skill can invoke another.

## Kernel

`kernel/` is the deterministic, host-independent controller. Consumers vendor it at
`.amanar/kernel/` and invoke `amanar-workflow validate|begin|run-check|verify|
status`. See `kernel/docs/contract.md`. `hosts.py` holds the shared, non-interactive
invocation shapes for each supported host, reused by the portability pack
(`tests/run-portability-pack.py`) and the bounded-loop runner.

## Hosts

Pi is the primary harness; Claude and Codex are secondary. Each runs the kernel by
calling the vendored `.amanar/kernel/amanar-workflow` — the controller is identical
across hosts.

Pi (primary):

- **Headless:** `pi -p "<prompt>" --mode json --no-session --thinking <level>
  [--provider <p> --model <m>]`. `--no-session` gives fresh context per run;
  `--mode json` is machine-gradable.
- **Repo rules:** Pi auto-discovers `AGENTS.md` and `CLAUDE.md`
  (`--no-context-files` disables). The root `AGENTS.md` is Pi's instruction file;
  keep it lean.
- **Skills:** loaded from `~/.agents/skills/` and project `.agents/skills/`;
  `--skill <path>` / `--no-skills` control loading.
- **Explicit-only:** Pi honors no per-skill frontmatter gate. Governed and loop
  invocations enforce explicit invocation structurally with
  `pi --no-skills --skill <path>` (load exactly the intended skill); interactive use
  relies on each skill's "Use only when explicitly invoked" description.
- **Models:** default provider/model come from Pi settings; override with
  `--provider`/`--model`. Routing intent: GPT by default, Claude-on-Vertex as the
  secondary lane.

