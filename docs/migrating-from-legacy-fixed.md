# Migrating from the legacy fixed profile

The root Copier template remains supported as the `legacy-fixed` profile while
the toolkit transitions to `$scaffold` as its primary interface.

## Existing generated repositories

Do not restructure an existing generated repository automatically.

- Keep its current `.copier-answers.yml` and update path.
- Continue using `copier update --trust` when that repository has accepted the
  fixed profile's contract.
- Resolve template updates within the generated repository's own instructions and
  dirty-state boundaries.
- Treat conversion to an adaptive harness as a separate, explicitly approved
  adoption task.

## New repositories

Use `$scaffold new` to select only the structure justified by the repository's
purpose, actual toolchain, operating model, and current work. Choose the
`legacy-fixed` Copier profile only when its complete contract is intentionally
desired.

## Existing repositories that were not generated here

Use `$scaffold audit` before `$scaffold adopt`. Preserve working commands and
layout, add missing navigation or verification first, and avoid wholesale moves.

## Atlas

Atlas is not a migration target. Its `ops/` and `knowledge/` planes are an
intentional authority model and must remain intact. The toolkit uses that shape as
a preservation benchmark demonstrating that a valid repository need not resemble
the fixed Copier template.
