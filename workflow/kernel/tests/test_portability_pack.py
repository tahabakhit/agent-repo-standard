import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

RUNNER_PATH = Path(__file__).resolve().parents[2] / "tests" / "run-portability-pack.py"
SPEC = importlib.util.spec_from_file_location("portability_pack", RUNNER_PATH)
RUNNER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(RUNNER)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from amanar_workflow.contract import validate


class PortabilityPackTests(unittest.TestCase):
    def test_exact_five_tasks_have_valid_contracts(self):
        tasks = RUNNER.load_tasks()
        self.assertEqual({task["id"] for task in tasks}, RUNNER.EXPECTED_TASKS)
        for task in tasks:
            validate(task["contract"])

    def test_materialized_kernel_is_committed_and_discoverable(self):
        original = RUNNER.RUNS
        with tempfile.TemporaryDirectory() as temporary:
            RUNNER.RUNS = Path(temporary)
            try:
                task = RUNNER.load_tasks()[0]
                fixture = RUNNER.materialize(task, "codex", "kernel")
                self.assertTrue((fixture / ".amanar/kernel/amanar-workflow").is_file())
                self.assertTrue((fixture / ".agents/skills/amanar-workflow/SKILL.md").is_file())
                result = RUNNER.run_quiet(
                    [sys.executable, ".amanar/kernel/amanar-workflow", "validate"], fixture,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertFalse((fixture / ".amanar/kernel/amanar_workflow/__pycache__").exists())
                RUNNER.run_quiet(task["acceptance"]["command"], fixture)
                self.assertFalse(any(fixture.rglob("*.pyc")))
                status = RUNNER.run_quiet(["git", "status", "--porcelain"], fixture)
                self.assertEqual(status.stdout, "")
            finally:
                RUNNER.RUNS = original

    def test_token_usage_is_extracted_from_json_events(self):
        output = json.dumps({"usage": {"input_tokens": 12, "output_tokens": 3}})
        self.assertEqual(RUNNER.token_usage(output), {"input_tokens": 12, "output_tokens": 3})


if __name__ == "__main__":
    unittest.main()
