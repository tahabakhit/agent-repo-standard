# amanar-pi

Pi extension for the Amanar agent kit. Gives Pi native depth into the kit's skills and in-session safety.

## What it does

1. **Skill registration** (`resources_discover`) — registers `harness/pi/skills/` so Pi discovers `amanar-*` skills without manual configuration.

2. **Light bootstrap** (`context`) — injects a single, short note on the first LLM turn informing the agent that amanar skills are loaded. Deduplicated: injected once per session, never repeated. Not a coercive mega-prompt.

3. **Backpressure** (`tool_call`) — deny-unless-evidence gate on dangerous bash operations: `git push`, `git push --force`, `rm -rf`, `git reset --hard`, `git clean -f`, curl/wget piped to shell. All other tools pass through.

## Structure

```
harness/pi/
├── package.json          # name: amanar-pi; pi.extensions + pi.skillPaths
├── tsconfig.json         # strict, NodeNext modules
├── src/
│   ├── pi.d.ts           # minimal ambient types for @earendil-works/pi-coding-agent
│   ├── extension.ts      # Pi wiring (resources_discover, context, tool_call)
│   ├── bootstrap.ts      # pure helpers: getBootstrapContent, dedupe, insertion point
│   └── classify.ts       # pure helpers: classifyBashCommand, classifyToolCall
├── tests/
│   ├── bootstrap.test.ts # unit tests for bootstrap helpers
│   └── classify.test.ts  # unit tests for allow/deny classification
└── skills/               # amanar-* skill files (SKILL.md format)
```

## Setup

```sh
npm install --prefix harness/pi
npm test --prefix harness/pi
```

The `npm test` script runs `tsc --noEmit` then `node --test` on the pure-function tests. Pi wiring is not integration-tested without a live Pi session.

## Adding skills

Drop a `SKILL.md`-based directory under `harness/pi/skills/`. Pi discovers it automatically via the `resources_discover` handler.

## Portability

No estate hostnames, credentials, or references to other repos. All source is stdlib-only except the Pi SDK types (devDependency, with ambient fallback).
