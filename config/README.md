# config/ — shareable templates + private overlay

Amanar is the versioned source of truth for agent configuration. Nothing here is
applied automatically: `bin/amanar install` (explicit, dry-run by default)
merges these templates into live host config.

## Public templates (this directory)

| Area | Template | Installed to |
|---|---|---|
| doctrine | `doctrine/doctrine.md` | Claude `CLAUDE.md`, Codex/Pi `AGENTS.md` |
| claude settings | `claude/settings.json` | `~/.claude/settings.json` |
| statusline | `statusline/ccstatusline.json` | `~/.claude/ccstatusline.json` |
| mcp | `mcp/.mcp.json` | `~/.claude/.mcp.json` |
| model routing | `model-routing/model-routing.json` | `~/.claude/model-routing.json` |
| pi | `pi/config.json` | `~/.agents/config.json` |
| kb | `kb/kb.yml` | `~/.config/amanar/kb.yml` |

Templates carry **no secrets** — placeholders only.

## Private overlay (`overlay/`, gitignored)

Personal or secret values live in `overlay/<area>/<file>` mirroring the template
paths. When an overlay file exists, the installer prefers it over the public
template, so secrets reach live config but are never committed. `overlay/` is
gitignored in its entirety.

## Install / sync

```sh
bin/amanar install          # dry-run: print the plan, write nothing
bin/amanar install --apply  # write to live host config
bin/amanar sync --apply     # re-apply (idempotent)
```

Never silent, never commits secrets. Host homes are overridable by env
(`CLAUDE_HOME`, `CODEX_HOME`, `AGENTS_HOME`, `AMANAR_CONFIG_HOME`) for testing.
