# Resume and handoff digest

`node .amanar/kernel/src/tools/renderHandoff.ts` renders a deterministic Markdown
handoff from controller state. It is read-only and reuses the controller's own
freshness logic; it is not part of the frozen CLI or the workflow contract.

The digest has four parts:

- **State** — the derived state (`planned` / `implementing` / `blocked` /
  `verified`). A recorded `verified` whose receipts no longer match current source
  is shown as `implementing (recorded verified)`, matching `status --json`.
- **Receipts** — per check: `CURRENT` (passing and fresh), `STALE` (present but
  invalidated by a contract, check, source, or output change), or `MISSING`.
- **Closet** — the workflow id, workflow hash, scope, exclusions, and artifacts, so
  a fresh session has the verbatim references it needs.
- **Rebuild to verified** — the ordered controller commands remaining: `begin` when
  not yet implementing, `run-check <id>` for every non-current check, then `verify`.

A fresh session reconstructs state mechanically from the digest: run the rebuild
steps in order until `verify` prints `AMANAR_VERIFIED`.

The stale-if receipts, coordinate closet, and checklist-rebuild pattern is
reimplemented from `iamneilroberts/claude-skills` (MIT); the deterministic staleness
comes from the kernel's own receipts.
