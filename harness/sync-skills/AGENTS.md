# Sync-skills component

`sync_skills.py` links Amanar's portable `amanar-*` skills into each coding-agent
host's skill directory — Pi (`~/.agents/skills`), Codex (`~/.codex/skills`), Claude
(`~/.claude/skills`). It is the versioned, tested superset of the ad-hoc
`~/.agents/scripts` linkers; those can be retired once this is in use.

Boundaries:

- Opt-in developer tool: dry-run by default, `--apply` to act, `--remove` to unlink.
  Never run by `make validate` or a hook.
- Writes only under each host's skill directory. It supersedes a pre-amanar personal
  skill (`scaffold`, `codebase-design`) only by backing it up, never deleting
  outright, and never touches a protected `.system` directory or a symlinked skills
  directory.
- Local only. Remote propagation to an estate is operational and belongs in Anẓar,
  not here.
- Host homes are overridable via `AGENTS_HOME` / `CODEX_HOME` / `CLAUDE_HOME`.

Run `python3 -m unittest discover -s tests` after changes; the tests use temporary
host homes and never touch real user config.
