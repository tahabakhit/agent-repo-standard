.PHONY: validate

# `npm run check` is intentionally excluded from the shared gate: it verifies
# canonical run records against generated evaluator artifacts, which are
# git-ignored and absent on a clean checkout. Run it locally after generating
# artifacts. `npm test` covers the validation/digest logic via fixtures.
validate:
	python3 harness/tests/validate-harness.py
	python3 -m unittest discover -s harness/backpressure/tests
	python3 -m unittest discover -s harness/sync-skills/tests
	python3 workflow/tests/validate-workflow.py
	python3 tests/validate-components.py
	node scripts/check-skill-consistency.mjs
	npm test --prefix harness/pi
	npm test --prefix harness/claude
	npm test --prefix workflow/kernel
	npm test --prefix workflow/loop
	npm test --prefix knowledge
	npm test --prefix workflow/agent-eval
	git diff --check
