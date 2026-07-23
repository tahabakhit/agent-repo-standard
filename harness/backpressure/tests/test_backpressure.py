import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

BACKPRESSURE = Path(__file__).resolve().parents[1]
HOOK = BACKPRESSURE / "pre-commit"
INSTALL = BACKPRESSURE / "install.py"

PASS_CONTRACT = '{"checks":[{"id":"ok","command":"true","expectedExit":0,"outputContains":[],"timeoutSeconds":10}]}'
FAIL_CONTRACT = '{"checks":[{"id":"bad","command":"false","expectedExit":0,"outputContains":[],"timeoutSeconds":10}]}'


class BackpressureTestCase(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        for command in (
            ["git", "init", "-q"],
            ["git", "config", "user.email", "bp@example.invalid"],
            ["git", "config", "user.name", "BP"],
        ):
            subprocess.run(command, cwd=self.root, check=True)
        (self.root / "keep.txt").write_text("content\n")
        subprocess.run(["git", "add", "-A"], cwd=self.root, check=True)
        subprocess.run(["git", "commit", "-qm", "init"], cwd=self.root, check=True)

    def tearDown(self):
        self.temporary.cleanup()

    def hook(self):
        return subprocess.run([sys.executable, str(HOOK)], cwd=self.root, capture_output=True, text=True)

    def stage(self, name, content):
        (self.root / name).write_text(content)
        subprocess.run(["git", "add", name], cwd=self.root, check=True)

    def write_contract(self, body):
        (self.root / ".amanar").mkdir(exist_ok=True)
        (self.root / ".amanar" / "workflow.json").write_text(body)

    def test_clean_tree_without_contract_passes(self):
        self.assertEqual(self.hook().returncode, 0)

    def test_passing_contract_checks_pass(self):
        self.write_contract(PASS_CONTRACT)
        self.assertEqual(self.hook().returncode, 0)

    def test_failing_contract_check_blocks(self):
        self.write_contract(FAIL_CONTRACT)
        result = self.hook()
        self.assertEqual(result.returncode, 1)
        self.assertIn("check bad failed", result.stderr)

    def test_staged_whitespace_blocks(self):
        self.stage("bad.txt", "trailing space \n")
        result = self.hook()
        self.assertEqual(result.returncode, 1)
        self.assertIn("whitespace", result.stderr)

    def test_install_and_remove_roundtrip(self):
        subprocess.run([sys.executable, str(INSTALL), "--root", str(self.root)], check=True)
        dest = self.root / ".git" / "hooks" / "pre-commit"
        self.assertTrue(dest.exists())
        self.assertEqual(dest.read_text(), HOOK.read_text())
        subprocess.run([sys.executable, str(INSTALL), "--root", str(self.root), "--remove"], check=True)
        self.assertFalse(dest.exists())

    def test_install_backs_up_existing_hook(self):
        hooks = self.root / ".git" / "hooks"
        hooks.mkdir(parents=True, exist_ok=True)
        (hooks / "pre-commit").write_text("#!/bin/sh\necho other\n")
        subprocess.run([sys.executable, str(INSTALL), "--root", str(self.root)], check=True)
        self.assertTrue((hooks / "pre-commit.pre-amanar").exists())
        self.assertEqual((hooks / "pre-commit").read_text(), HOOK.read_text())


if __name__ == "__main__":
    unittest.main()
