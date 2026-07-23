import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

KERNEL = Path(__file__).resolve().parents[1]
CLI = KERNEL / "amanar-workflow"
sys.path.insert(0, str(KERNEL / "tools"))

import render_handoff  # noqa: E402


def base_contract():
    return {
        "schemaVersion": "1.0.0",
        "id": "handoff-fixture",
        "objective": "Exercise the handoff digest",
        "scope": ["src.txt", "result.txt"],
        "exclusions": [],
        "artifacts": ["result.txt"],
        "authority": {"repositoryWrites": True, "liveEffects": False},
        "checks": [{
            "id": "tests",
            "command": "python3 -m unittest discover -s tests -v",
            "expectedExit": 0,
            "outputContains": ["OK"],
            "timeoutSeconds": 10,
            "minTests": 1,
            "testParser": "unittest",
            "liveEffect": False,
        }],
    }


class RenderHandoffTestCase(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / ".amanar").mkdir()
        (self.root / "tests").mkdir()
        (self.root / "tests" / "test_ok.py").write_text(
            "import unittest\nclass T(unittest.TestCase):\n    def test_ok(self): self.assertTrue(True)\n"
        )
        (self.root / "src.txt").write_text("source\n")
        (self.root / "result.txt").write_text("result\n")

    def tearDown(self):
        self.temporary.cleanup()

    def initialize(self, contract=None):
        contract = contract or base_contract()
        (self.root / ".amanar" / "workflow.json").write_text(json.dumps(contract))
        for command in (
            ["git", "init", "-q"],
            ["git", "config", "user.email", "fixture@example.invalid"],
            ["git", "config", "user.name", "Fixture"],
            ["git", "add", "-A"],
            ["git", "commit", "-qm", "fixture"],
        ):
            subprocess.run(command, cwd=self.root, check=True)
        return contract

    def ctl(self, *args):
        return subprocess.run(
            [sys.executable, str(CLI), *args], cwd=self.root, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )

    def test_planned_lists_begin_first(self):
        self.initialize()
        digest = render_handoff.render(self.root)
        self.assertIn("State: **planned**", digest)
        self.assertIn("`tests`: **MISSING**", digest)
        self.assertIn("1. `begin`", digest)
        self.assertIn("`verify`", digest)

    def test_implementing_lists_remaining_check(self):
        self.initialize()
        self.assertEqual(self.ctl("begin").returncode, 0)
        digest = render_handoff.render(self.root)
        self.assertIn("State: **implementing**", digest)
        self.assertIn("`run-check tests`", digest)
        self.assertNotIn("1. `begin`", digest)

    def test_verified_reports_no_action(self):
        self.initialize()
        self.assertEqual(self.ctl("begin").returncode, 0)
        self.assertEqual(self.ctl("run-check", "tests").returncode, 0)
        self.assertEqual(self.ctl("verify").returncode, 0)
        digest = render_handoff.render(self.root)
        self.assertIn("State: **verified**", digest)
        self.assertIn("`tests`: **CURRENT**", digest)
        self.assertIn("No action needed", digest)

    def test_source_change_downgrades_and_stales(self):
        self.initialize()
        self.assertEqual(self.ctl("begin").returncode, 0)
        self.assertEqual(self.ctl("run-check", "tests").returncode, 0)
        self.assertEqual(self.ctl("verify").returncode, 0)
        (self.root / "src.txt").write_text("changed\n")
        digest = render_handoff.render(self.root)
        self.assertIn("State: **implementing** (recorded verified)", digest)
        self.assertIn("`tests`: **STALE**", digest)
        self.assertIn("`run-check tests`", digest)

    def test_closet_lists_artifacts_and_hash(self):
        contract = self.initialize()
        digest = render_handoff.render(self.root)
        self.assertIn("`result.txt`", digest)
        self.assertIn(contract["id"], digest)
        self.assertIn("Workflow hash:", digest)


if __name__ == "__main__":
    unittest.main()
