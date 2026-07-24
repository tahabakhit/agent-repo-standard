# Harness component

`amanar-scaffold` may inspect and change only the target repository. It must
preserve valid architecture, use `AGENTS.md` as canonical cross-agent guidance,
and add only justified files. It must never modify home-directory configuration,
install products, publish, push, deploy, or invoke machine bootstrap operations.

Run `python3 tests/validate-harness.py` after changes.
