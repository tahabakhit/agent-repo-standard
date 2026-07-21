.PHONY: validate

validate:
	python3 harness/tests/validate-harness.py
	python3 workflow/tests/validate-workflow.py
	git diff --check

