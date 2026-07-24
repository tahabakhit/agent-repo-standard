# Config

Amanar is the versioned source of truth for agent configuration. Nothing is
applied automatically — `bin/amanar install` (explicit, dry-run by default)
merges the templates into live host config.

- **Public templates** live in [`config/`](../config/README.md): doctrine,
  Claude settings, ccstatusline, `.mcp`, model-routing, Pi, and the kb store
  config. Templates carry no secrets.
- **Private overlay** at `overlay/` (gitignored) mirrors the template paths;
  when an overlay file exists the installer prefers it, so secrets reach live
  config but are never committed.
- **Doctrine** (`config/doctrine/doctrine.md`) is the one canonical agent
  doctrine, installed as `CLAUDE.md` (Claude) and `AGENTS.md` (Codex/Pi).
- **kb** is a private, git-backed knowledge store any harness reads; its location
  lives in the overlay and its contents are never published.

```sh
bin/amanar install          # dry-run: print the plan, write nothing
bin/amanar install --apply  # write to live host config
bin/amanar sync --apply     # idempotent re-apply
```

Never silent, never commits secrets. See [config/README.md](../config/README.md)
for the full template → target mapping.
