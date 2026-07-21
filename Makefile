.PHONY: validate

validate:
	python3 harness/tests/validate-harness.py
	python3 workflow/tests/validate-workflow.py
	python3 -m py_compile storage/synology-mcp/synology_mcp_server.py
	python3 -m compileall -q agents/tiered-hermes/tiered_hermes
	git diff --check
