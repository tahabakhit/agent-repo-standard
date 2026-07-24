# Amanar kit — install guide

Seven skills ship in two directories:

| Dir | Skills |
|---|---|
| `workflow/skills/` | amanar-assure, amanar-design, amanar-inquire, amanar-remember, amanar-workflow, amanar-writing-skills |
| `harness/skills/` | amanar-scaffold |

---

## Pi

**From git (recommended)**

```
pi install git:github.com/your-org/amanar
```

**From a local clone**

```
pi install /path/to/amanar
```

The root `package.json` `pi` key declares:

- **extension** — `harness/pi/src/extension.ts` (type-stripped by Pi; provides bootstrap context injection and backpressure)
- **skillPaths** — `workflow/skills` and `harness/skills`

Pi loads the extension and registers all skill directories in one step.
No separate skill install is needed.

---

## Claude Code

**One-time skill link (run after cloning or pulling)**

```
node harness/claude/scripts/link-skills.mjs
```

This creates relative symlinks from `harness/claude/skills/` to every `amanar-*`
directory in `workflow/skills/` and `harness/skills/`. Claude Code requires
skills under the plugin root; symlinks avoid file duplication. The script is
idempotent and can be re-run safely.

**Load the plugin**

Development / per-session:

```
claude --plugin-dir /path/to/amanar/harness/claude
```

Persistent (installs via marketplace or `claude plugin` command):
point your plugin source at `harness/claude/`.

Skills load as `/amanar:<skill-name>` (namespaced by the plugin `name` field).

**PreToolUse backpressure gate**

`harness/claude/hooks/hooks.json` wires a `PreToolUse` hook for the `Bash` tool.
The hook runs `harness/claude/hooks/pre-tool-use.ts` via
`node --experimental-strip-types` and reuses the classifier from
`harness/pi/src/classify.ts` as the single source of truth.
No compilation step is required.

---

## Codex (best-effort)

Codex reads agent skills from `.agents/skills/` and `agents/openai.yaml` sidecars.

Each skill directory already contains `agents/openai.yaml`. Copy or symlink the
skill directories you want into your repo's `.agents/skills/`:

```
mkdir -p .agents/skills
ln -s /path/to/amanar/workflow/skills/amanar-inquire .agents/skills/
# repeat for other skills
```

`allow_implicit_invocation: false` in `openai.yaml` marks skills that require
explicit invocation. Codex honours this when the agent runtime reads the sidecar.
