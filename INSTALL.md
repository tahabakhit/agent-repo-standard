# Amanar kit — install guide

Seven skills ship under a single `skills/` directory:

`amanar-interview`, `amanar-plan`, `amanar-adversarial-review`, `amanar-remember`,
`amanar-author-skill`, `amanar-deliver`, `amanar-onboard`.

---

## Pi

**From git**

```
pi install git:github.com/tahabakhit/amanar
```

**From a local clone**

```
pi install /path/to/amanar
```

The root `package.json` `pi` key declares:

- **extension** — `pi/extension.ts` (type-stripped by Pi; provides bootstrap
  context injection and in-session backpressure)
- **skillPaths** — `skills`

Pi loads the extension and registers the skills directory in one step. No separate
skill install is needed.

---

## Claude Code

The plugin root is the repository root, so no symlink or vendor sync step is
required: `skills/` and `hooks/hooks.json` are discovered directly.

**Development / per-session**

```
claude --plugin-dir /path/to/amanar
```

**Persistent** — point your marketplace/plugin source at the repository root
(`.claude-plugin/marketplace.json` declares `source: "./"`).

Skills load as `/amanar:<skill-name>`. The `PreToolUse` hook in `hooks/hooks.json`
runs `bin/amanar hook pre-tool-use`, which reuses the shared classifier in
`src/classify.ts` as the single source of truth for backpressure deny rules.

---

## Codex (best-effort)

Codex reads agent skills from `.agents/skills/` and `agents/openai.yaml` sidecars.
Each skill directory already contains `agents/openai.yaml`. Copy or symlink the
skill directories you want into your repo's `.agents/skills/`:

```
mkdir -p .agents/skills
ln -s /path/to/amanar/skills/amanar-interview .agents/skills/
# repeat for other skills
```

`allow_implicit_invocation: false` in `openai.yaml` marks skills that require
explicit invocation. Codex honours this when the agent runtime reads the sidecar.
