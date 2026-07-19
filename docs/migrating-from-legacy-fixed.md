# Migrating from the legacy fixed profile

`$scaffold` is the primary interface for new repositories and for auditing or
adopting existing repositories. The root Copier template remains available only
as the optional `legacy-fixed` generator for a new, empty destination.

## Support contract

- `$scaffold new`, `$scaffold audit`, and `$scaffold adopt` are adaptive agent
  workflows.
- The legacy generator creates one opinionated fixed layout; it does not audit or
  adopt an existing repository.
- Copier's project-update workflow is unsupported until deliberately implemented
  and covered by integration tests.
- The legacy `code` and `library` profiles are Python-specific. `data` and
  `workspace` are non-code profiles.

## Existing generated repositories

Do not re-run the legacy generator over a generated repository. Its historical
answers file does not establish a supported update path.

Use `$scaffold audit` to inspect the repository as it exists now. If changes are
justified, use `$scaffold adopt` as a separate, explicitly approved task that
preserves working commands, layout, and intentional documentation.

## New repositories

Use `$scaffold new` to select only the structure justified by the repository's
purpose, actual toolchain, operating model, and current work. Choose the
`legacy-fixed` Copier generator only when its complete layout is intentionally
desired. Run `bin/new-repo.sh` with a missing or empty destination; it rejects a
non-empty destination before generation.

## Existing repositories that were not generated here

Use `$scaffold audit` before `$scaffold adopt`. Do not apply the Copier generator
to the repository. Preserve working commands and layout, add missing navigation
or verification first, and avoid wholesale moves.

## Atlas

Atlas is not a migration target. Its `ops/` and `knowledge/` planes are an
intentional authority model and must remain intact. The toolkit uses that shape as
a preservation benchmark demonstrating that a valid repository need not resemble
the fixed Copier template.
