.PHONY: validate

# Single-package, single-language (TypeScript) gate. `bin/amanar validate` runs
# the onboard/skills/components/skill-consistency checks; `npm test` runs the
# node:test suites (kernel, loop, knowledge, pi, hooks, sync, eval). The eval
# `check`/`render` verbs stay out of the gate — they need git-ignored evaluator
# artifacts absent on a clean checkout.
validate:
	node bin/amanar validate
	npm run typecheck
	npm test
	git diff --check
