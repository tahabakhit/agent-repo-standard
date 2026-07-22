# Platform skill specifications

Research fetched 2026-07-22.

## Claude Code

Source: https://code.claude.com/docs/en/skills

Each skill is a directory whose required entrypoint is `SKILL.md`. YAML
frontmatter is the metadata contract; `name` is optional and defaults to the
directory name, while `description` is recommended. `allowed-tools` is optional.
Project skills are discovered from `.claude/skills/<skill-name>/SKILL.md` and
nested `.claude/skills` directories; personal skills use
`~/.claude/skills/<skill-name>/SKILL.md`. Explicit-only behavior is controlled by
`disable-model-invocation: true` in the frontmatter.

## Codex

Sources: https://developers.openai.com/codex/build-skills and
https://developers.openai.com/codex/agent-configuration/agents-md

The skill entrypoint is `SKILL.md` with `name` and `description`. Optional UI and
policy metadata is `agents/openai.yaml`, with `interface` fields such as
`display_name`, `short_description`, and `default_prompt`; explicit-only policy is
`policy.allow_implicit_invocation: false` (the default is true). Repository skills
are discovered under `.agents/skills` from the current directory through the
repository root.

## Pi

Source: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md

Pi uses the Agent Skills standard: the skill directory contains `SKILL.md`, and
the skill is invoked as `/skill:<name>`. Pi discovers skills from
`~/.pi/agent/skills/`, `~/.agents/skills/`, `.pi/skills/`, or `.agents/skills/`
from the current directory upward, or from a Pi package. Pi does not document a
per-skill metadata file or an explicit-only switch. The shared `SKILL.md`
description states the explicit-invocation policy, and this limitation must be
considered when installing into Pi.

## Repository convention

The six instrument skills retain one shared `SKILL.md` contract and Codex
`agents/openai.yaml`. Claude uses the frontmatter, and Pi uses the same standard
frontmatter after installation under its discovered skill directory.
