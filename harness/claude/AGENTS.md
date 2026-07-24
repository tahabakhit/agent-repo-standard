# Claude Code adapter component

Boundary: portable Claude Code plugin; loads amanar skills + a PreToolUse backpressure gate reusing the Pi classifier. No estate specifics.

Paths owned by this component: `harness/claude/` only. Do not touch `components.yaml`, `Makefile`, or `README.md` at repo root.

Validation: `npm test --prefix harness/claude`

The test command runs `tsc --noEmit` (typecheck) then `node --test` on pure-function unit tests. The Claude Code plugin wiring cannot be integration-tested without a live Claude Code session; that is expected and acceptable.

## Single source of truth for deny rules

The hook script `hooks/pre-tool-use.ts` imports `classifyToolCall` from `../../pi/src/classify.ts`. That file is the sole authority for backpressure deny rules. Do NOT duplicate or shadow the rule list here. If the cross-directory import becomes problematic (e.g. a future build system that cannot traverse the boundary), create a tiny re-export shim rather than copying rules.

## Cross-directory TypeScript import

`tsconfig.json` sets `allowImportingTsExtensions: true` (requires `noEmit: true`) so that the `.ts` extension in `import ... from '../../pi/src/classify.ts'` typechecks under NodeNext module resolution. TypeScript follows the relative import to the pi source and typechecks it as a dependency; `../../pi/src/extension.ts` is NOT included (it has pi-SDK deps that are not installed here).

## Hook path in hooks.json

`hooks/hooks.json` references the hook script via `${CLAUDE_PROJECT_DIR}/harness/claude/hooks/pre-tool-use.ts`. Within this monorepo, `CLAUDE_PROJECT_DIR` resolves to the repo root and the path is correct. When installing the plugin outside the monorepo via `--plugin-dir`, update the command path in `hooks/hooks.json` to the absolute or `${CLAUDE_PROJECT_DIR}`-relative path of the installed plugin.

## Skills directory

`skills/` is the mount point for amanar-* skills. It is intentionally empty in this component; the skills layer of the kit populates it. Claude Code discovers skills here when the plugin is loaded.

Keep all source portable: no hostnames, credentials, or references to other repos.
