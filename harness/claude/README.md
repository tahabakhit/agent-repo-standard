# amanar-claude

Claude Code plugin for the Amanar agent kit. Provides:

- **Skills mount-point** — `skills/` directory where amanar-* skills are exposed to Claude Code.
- **PreToolUse backpressure gate** — a `hooks/pre-tool-use.ts` hook that blocks destructive Bash operations (force-push, rm -rf, git reset --hard, curl-pipe-sh, etc.) before they execute. The deny rules live in `harness/pi/src/classify.ts` and are shared with the Pi adapter.

## Plugin structure

```
harness/claude/
├── .claude-plugin/plugin.json   Claude Code plugin manifest
├── hooks/
│   ├── hooks.json               PreToolUse hook registration
│   └── pre-tool-use.ts          Hook script (reads stdin, emits decision)
├── skills/                      Mount point for amanar-* skills
├── tests/
│   └── pre-tool-use.test.ts     Pure-function unit tests (node:test)
├── package.json
└── tsconfig.json
```

## Loading the plugin

Within the amanar project:

```sh
claude --plugin-dir ./harness/claude
```

To load it from another project, pass the absolute path:

```sh
claude --plugin-dir /path/to/amanar/harness/claude
```

When loading externally, update the `command` path in `hooks/hooks.json` to point at the correct location of `pre-tool-use.ts`.

## Running tests

```sh
npm test --prefix harness/claude
# or from within harness/claude/:
npm test
```

Requires Node >=22 and npm. The test suite runs `tsc --noEmit` (typecheck) then `node --test` on the pure-function tests; no live Claude Code session is needed.

## Backpressure rules

Deny rules are not defined in this package. They are imported from `harness/pi/src/classify.ts`. The same rules apply in both the Pi and Claude Code adapters. To add or modify rules, edit `harness/pi/src/classify.ts` and run both `npm test --prefix harness/pi` and `npm test --prefix harness/claude`.
