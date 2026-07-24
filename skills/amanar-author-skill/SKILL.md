---
name: amanar-author-skill
description: Apply the kit skill-authoring discipline when writing or revising a SKILL.md — use when authoring a new skill, revising an existing skill for clarity or compliance, or reviewing a draft for consistency with kit conventions.
---

# Amanar Author Skill

## Hard rules

Every SKILL.md carries YAML frontmatter with `name` (matching the directory) and
`description` (one trigger-rich line: what the skill does, then when to use it).

Invocation policy must be consistent across both files:

| Axis | Model-invocable | Explicit-only |
|---|---|---|
| Frontmatter | no `disable-model-invocation` | `disable-model-invocation: true` |
| `agents/openai.yaml` | `allow_implicit_invocation: true` | `allow_implicit_invocation: false` |
| Typical use | reasoning, clarification, authoring | live effects (writes, commits, API calls) |

A user-invoked skill may call model-invocable skills via prose invocation tokens
(the skill name prefixed with `$`); it must never call another user-invoked skill.
Model-invocable skills must not carry the explicit-only guard clause.

## Steps

1. Set `name` to the directory's kebab-case name; write `description` as a single
   trigger-rich line.
2. Write the body in this order: activation/description → hard rules → decision
   points → steps → output/completion criterion → references. Omit empty sections.
3. Target 180–450 tokens of body; push detail to `references/` files and link them
   from the body. Hard max: 1000 tokens.
4. Phrase positively — state the target behavior. Add a prohibition only when the
   positive form is ambiguous; pair it immediately with the correct alternative.
5. Prune duplication, no-ops, and sprawl. Each fact lives in one place; reference it,
   do not copy it. Express skill dependencies as prose invocation tokens
   (e.g. `$amanar-interview`), not as cross-file markdown links.
6. Create or update `agents/openai.yaml` to match the invocation policy.

## Completion criterion

All conditions are met before declaring done:

- Frontmatter contains `name` (matches directory) and `description`.
- Invocation policy is internally consistent (frontmatter ↔ `agents/openai.yaml`).
- Body follows the section order and is within the token budget.
- No inline duplication; no broken relative links.
- The validator at `workflow/tests/validate-workflow.py` passes for this skill.
