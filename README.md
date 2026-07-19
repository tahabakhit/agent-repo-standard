# agent-repo-standard

An adaptive repository-harness toolkit for creating, auditing, or improving
repositories without imposing one universal directory tree.

The primary interface is the repository-owned [`$scaffold`](skills/scaffold/SKILL.md)
skill. It inspects a project, preserves coherent existing conventions, and proposes
the smallest authority and validation structure that pays for itself.

## What the toolkit provides

- Adaptive principles for authority, progressive disclosure, proportional
  structure, existing-repository adoption, and validation.
- Composable profile guidance for applications, libraries, CLIs, infrastructure,
  data, knowledge, and monorepos.
- A documented corpus for reviewing `$scaffold new|adopt|audit`
  recommendations against representative behavioural cases.
- An optional, opinionated Copier generator for new repositories that explicitly
  choose the former fixed standard.

The toolkit does not make Diátaxis, MADR, TDD, Python packaging, Makefiles,
`src/`, `data/`, `deliverables/`, or `artifacts/` universal requirements.

## Use `$scaffold`

```text
$scaffold new <destination and requirements>
$scaffold adopt <existing repository>
$scaffold audit <existing repository>
```

- `new` creates the minimum useful harness for a new repository.
- `adopt` adds or repairs navigation, authority, and verification while preserving
  working conventions.
- `audit` reports gaps and a proposed harness without modifying files.

The skill's supporting references are:

- [`harness-principles.md`](skills/scaffold/references/harness-principles.md)
- [`repository-profiles.md`](skills/scaffold/references/repository-profiles.md)

## Legacy fixed Copier profile

The root `copier.yml`, `template/`, `bin/new-repo.sh`, and
`tests/verify-template.sh` form the optional `legacy-fixed` generator. It creates
new repositories with one complete, opinionated layout. It is not the default
interface and it does not adapt the layout to an existing repository.

The supported legacy entrypoint accepts only a missing or empty destination:

```bash
bin/new-repo.sh <new-empty-destination>
```

Its `code` and `library` profiles are specifically Python profiles. The `data`
and `workspace` profiles are non-code profiles. Existing-repository adoption and
Copier's project-update workflow are unsupported. Use `$scaffold audit` or
`$scaffold adopt` for an existing repository, including one previously generated
from the fixed template.

See [migrating from the legacy fixed profile](docs/migrating-from-legacy-fixed.md)
for the full support boundary.

## Validation

The deterministic release gate checks skill structure and references, evaluation
fixture schema, documentation assertions, shell syntax, actual legacy renders,
generated validation commands, destination safety, and patch whitespace:

```bash
python3 tests/validate-toolkit.py
tests/verify-template.sh
git diff --check
```

The render check uses the exact Copier version in
[`tests/requirements-ci.txt`](tests/requirements-ci.txt). It renders every legacy
profile, runs each generated repository's declared validation command, and checks
destination safety.

`tests/validate-toolkit.py` does not compute `$scaffold` recommendations. The
cases in [`tests/fixtures/scaffold-evaluations.json`](tests/fixtures/scaffold-evaluations.json)
are behavioural review inputs for an agent run, not deterministic unit tests.

## Preservation benchmark

Atlas is a read-only benchmark for a valid non-generic architecture. Its `ops/`
and `knowledge/` authority planes must be recognized and preserved, not normalized
into the `legacy-fixed` tree.
