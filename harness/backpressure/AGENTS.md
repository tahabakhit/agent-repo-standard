# Backpressure component

`pre-commit` is a self-contained, portable pre-commit hook that refuses a commit
unless structural checks pass: `git diff --cached --check`, plus every declared
check command from `.amanar/workflow.json` when a contract is present. The workflow
contract is the single source of truth for what must pass — the same checks that
gate the controller's `verify` also gate the commit.

`install.py` installs or removes the hook in one repository. It is per-repo and
reversible: it writes only `<root>/.git/hooks/pre-commit`, backs up a pre-existing
hook, and never touches global git config. `amanar-scaffold adopt` offers it; it is
never run by `make validate`.

Run `python3 -m unittest discover -s tests` after changes.
