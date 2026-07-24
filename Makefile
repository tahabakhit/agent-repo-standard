.PHONY: validate

# Single-package gate: one root install, one tsconfig, one test runner.
# `agent-eval`'s `npm run check` stays excluded (it verifies canonical run
# records against generated evaluator artifacts, which are git-ignored and
# absent on a clean checkout). `npm test` covers its logic via fixtures.
validate:
	python3 harness/tests/validate-harness.py
	python3 -m unittest discover -s harness/backpressure/tests
	python3 -m unittest discover -s harness/sync-skills/tests
	python3 workflow/tests/validate-workflow.py
	python3 tests/validate-components.py
	node scripts/check-skill-consistency.mjs
	node bin/amanar validate
	npm run typecheck
	npm test
	git diff --check
