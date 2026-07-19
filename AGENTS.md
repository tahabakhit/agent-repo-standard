# agent-repo-standard agent map

This repository owns the adaptive repository-harness toolkit and the preserved
`legacy-fixed` Copier profile.

## Source map

- `skills/scaffold/` is the primary adaptive interface and owns harness principles
  and composable profile guidance.
- `README.md` is the human entry point.
- `docs/migrating-from-legacy-fixed.md` owns compatibility and migration guidance.
- `copier.yml`, `template/`, `bin/new-repo.sh`, and `tests/verify-template.sh` are
  the legacy fixed profile and must remain update-compatible.
- `tests/validate-toolkit.py` checks the adaptive skill and fixture decisions.

## Boundaries

- Preserve working repository conventions; do not impose a universal tree.
- Add profiles, fragments, documentation taxonomies, ADRs, plans, runbooks, CI,
  or project-local skills only when they own real content.
- Do not create empty profile or fragment directories.
- Treat Atlas only as a read-only preservation benchmark. Never modify it from
  this repository's work.
- Keep legacy behavior changes separate from adaptive-toolkit changes.

## Validation

```sh
python3 tests/validate-toolkit.py
git diff --check
```

Run `tests/verify-template.sh` only when Copier is already available. Do not
install packages solely for validation.
