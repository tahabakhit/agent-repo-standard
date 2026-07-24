.PHONY: validate

# Single-package, single-language (TypeScript) gate. `bin/amanar validate` runs
# the harness/workflow/components/skill-consistency checks; `npm test` runs the
# node:test suites (kernel, loop, knowledge, pi, claude, agent-eval, hooks,
# sync). agent-eval's `npm run check` stays excluded — it needs git-ignored
# evaluator artifacts absent on a clean checkout.
validate:
	node bin/amanar validate
	npm run typecheck
	npm test
	git diff --check
