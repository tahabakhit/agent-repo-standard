import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

LOOP = Path(__file__).resolve().parents[1]
KERNEL = LOOP.parents[0] / "kernel"
sys.path.insert(0, str(LOOP))

import run_loop  # noqa: E402

DONE_CHECK = {
    "id": "done",
    "command": "python3 -c \"import pathlib,sys; sys.exit(0 if 'DONE' in pathlib.Path('work.txt').read_text() else 1)\"",
    "expectedExit": 0, "outputContains": [], "timeoutSeconds": 10,
    "minTests": 0, "testParser": "none", "liveEffect": False,
}


def base_contract(check=None):
    return {
        "schemaVersion": "1.0.0", "id": "loop-fixture",
        "objective": "write DONE to work.txt",
        "scope": ["work.txt"], "exclusions": [], "artifacts": ["work.txt"],
        "authority": {"repositoryWrites": True, "liveEffects": False},
        "checks": [check or DONE_CHECK],
    }


class RunLoopTestCase(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / "work.txt").write_text("TODO\n")

    def tearDown(self):
        self.temporary.cleanup()

    def vendor(self, contract=None):
        control = self.root / ".amanar"
        control.mkdir()
        (control / "workflow.json").write_text(json.dumps(contract or base_contract()))
        kernel = control / "kernel"
        kernel.mkdir()
        shutil.copy2(KERNEL / "VERSION", kernel / "VERSION")
        shutil.copy2(KERNEL / "amanar-workflow", kernel / "amanar-workflow")
        shutil.copytree(
            KERNEL / "amanar_workflow", kernel / "amanar_workflow",
            ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
        )
        (self.root / ".gitignore").write_text(".amanar/run/\n__pycache__/\n")
        for command in (
            ["git", "init", "-q"],
            ["git", "config", "user.email", "loop@example.invalid"],
            ["git", "config", "user.name", "Loop"],
            ["git", "add", "-A"],
            ["git", "commit", "-qm", "fixture"],
        ):
            subprocess.run(command, cwd=self.root, check=True)

    def run_loop(self, agent, contract=None, max_iterations=4, pass_k=1):
        return run_loop.loop(
            self.root, "pi", "model", "low", max_iterations, pass_k, 30, agent=agent,
        )

    def test_runner_verifies_after_one_fix(self):
        self.vendor()
        def agent(*_):
            (self.root / "work.txt").write_text("DONE\n")
            return 0, "fixed"
        result = self.run_loop(agent)
        self.assertEqual(result["outcome"], "verified")
        self.assertEqual(result["iterations"], 1)
        self.assertEqual(run_loop.status(self.root)["status"], "verified")

    def test_noop_agent_exhausts_bound(self):
        self.vendor()
        result = self.run_loop(lambda *_: (0, "noop"), max_iterations=3)
        self.assertEqual(result["outcome"], "exhausted")
        self.assertEqual(result["iterations"], 3)

    def test_retry_converges_on_later_iteration(self):
        self.vendor()
        calls = {"n": 0}
        def agent(*_):
            calls["n"] += 1
            if calls["n"] >= 2:
                (self.root / "work.txt").write_text("DONE\n")
            return 0, "step"
        result = self.run_loop(agent)
        self.assertEqual(result["outcome"], "verified")
        self.assertEqual(result["iterations"], 2)

    def test_runner_recovers_a_spurious_block(self):
        self.vendor()
        def agent(*_):
            (self.root / "work.txt").write_text("DONE\n")
            run_loop.controller(self.root, "begin")
            run_loop.controller(self.root, "block", "--reason", "waiting on authority")
            return 0, "blocked"
        result = self.run_loop(agent)
        self.assertEqual(result["outcome"], "verified")

    def test_live_effect_without_authority_stops(self):
        live = {**DONE_CHECK, "command": "true", "liveEffect": True}
        self.vendor(base_contract(live))
        result = self.run_loop(lambda *_: (0, "noop"))
        self.assertEqual(result["outcome"], "authority-required")

    def test_pass_k_requires_repeated_success(self):
        self.vendor()
        def agent(*_):
            (self.root / "work.txt").write_text("DONE\n")
            return 0, "fixed"
        result = self.run_loop(agent, pass_k=3)
        self.assertEqual(result["outcome"], "verified")
        (self.root / "work.txt").write_text("TODO\n")
        self.assertFalse(run_loop.passes_k(self.root, base_contract(), 1))


if __name__ == "__main__":
    unittest.main()
