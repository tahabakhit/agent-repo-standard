# agent-repo-standard

An adaptive repository-harness toolkit for creating or improving repositories
without imposing one universal directory tree.

The primary interface is the repository-owned [`$scaffold`](skills/scaffold/SKILL.md)
skill. It inspects a project, preserves coherent existing conventions, and proposes
the smallest authority and validation structure that pays for itself.

## What the toolkit provides

- Adaptive principles for authority, progressive disclosure, proportional
  structure, existing-repository adoption, and validation.
- Composable profile guidance for applications, libraries, CLIs, infrastructure,
  data, knowledge, and monorepos.
- A tested `$scaffold new|adopt|audit` workflow.
- A preserved Copier template for repositories already using the former fixed
  standard.

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

The existing root `copier.yml`, `template/`, `bin/new-repo.sh`, and
`tests/verify-template.sh` remain the supported `legacy-fixed` profile. They are
retained for update compatibility and are not the default experience for new
repositories.

Existing generated repositories may continue to update through Copier:

```bash
copier update --trust
```

New repositories should use `$scaffold` unless the fixed profile is explicitly
required. See [migrating from the legacy fixed profile](docs/migrating-from-legacy-fixed.md).

## Validation

The adaptive toolkit contract has no third-party Python dependencies:

```bash
python3 tests/validate-toolkit.py
git diff --check
```

When `copier` is already installed, the unchanged legacy profile can also be
rendered end to end:

```bash
tests/verify-template.sh
```

Do not install Copier merely to run an unrelated adaptive-toolkit change.

## Preservation benchmark

Atlas is a read-only benchmark for a valid non-generic architecture. Its `ops/`
and `knowledge/` authority planes must be recognized and preserved, not normalized
into the `legacy-fixed` tree.
