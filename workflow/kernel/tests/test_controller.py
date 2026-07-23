import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

CLI = Path(__file__).resolve().parents[1] / "amanar-workflow"


def base_contract():
    return {
        "schemaVersion": "1.0.0",
        "id": "controller-fixture",
        "objective": "Exercise the controller",
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


class ControllerTestCase(unittest.TestCase):
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
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        subprocess.run(["git", "config", "user.email", "fixture@example.invalid"], cwd=self.root, check=True)
        subprocess.run(["git", "config", "user.name", "Fixture"], cwd=self.root, check=True)
        subprocess.run(["git", "add", "-A"], cwd=self.root, check=True)
        subprocess.run(["git", "commit", "-qm", "fixture"], cwd=self.root, check=True)
        return contract

    def ctl(self, *args):
        return subprocess.run(
            [sys.executable, str(CLI), *args], cwd=self.root, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )

    def begin_and_check(self):
        self.assertEqual(self.ctl("begin").returncode, 0)
        result = self.ctl("run-check", "tests")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_happy_path_and_receipt_bindings(self):
        self.initialize()
        self.assertEqual(self.ctl("validate").returncode, 0)
        self.begin_and_check()
        verified = self.ctl("verify")
        self.assertEqual(verified.returncode, 0, verified.stderr)
        self.assertIn("AMANAR_VERIFIED", verified.stdout)
        receipt = json.loads((self.root / ".amanar/run/receipts/tests.json").read_text())
        for key in ("workflowHash", "checkDefinitionHash", "sourceDigest", "command",
                    "exitCode", "discoveredTests", "recordedAt", "stdoutSha256", "stderrSha256"):
            self.assertIn(key, receipt)
        status = self.ctl("status", "--json")
        self.assertEqual(json.loads(status.stdout)["status"], "verified")

    def test_missing_receipt_is_incomplete_evidence(self):
        self.initialize()
        self.assertEqual(self.ctl("begin").returncode, 0)
        result = self.ctl("verify")
        self.assertEqual(result.returncode, 5)
        self.assertIn("missing receipt", result.stderr)

    def test_repository_write_authority_is_enforced(self):
        contract = base_contract()
        contract["authority"]["repositoryWrites"] = False
        self.initialize(contract)
        result = self.ctl("begin")
        self.assertEqual(result.returncode, 3)
        self.assertFalse((self.root / ".amanar/run").exists())

    def test_live_effect_authority_rejects_before_execution(self):
        contract = base_contract()
        contract["checks"][0].update({
            "command": "touch LIVE_EFFECT_RAN", "minTests": 0,
            "testParser": "none", "outputContains": [], "liveEffect": True,
        })
        self.initialize(contract)
        self.assertEqual(self.ctl("begin").returncode, 0)
        result = self.ctl("run-check", "tests")
        self.assertEqual(result.returncode, 3)
        self.assertFalse((self.root / "LIVE_EFFECT_RAN").exists())

    def test_zero_discovered_tests_fail_closed(self):
        contract = base_contract()
        contract["checks"][0]["command"] = "python3 -c \"print('OK')\""
        self.initialize(contract)
        self.assertEqual(self.ctl("begin").returncode, 0)
        result = self.ctl("run-check", "tests")
        self.assertEqual(result.returncode, 4)
        self.assertIn("tests=unparsed", result.stdout)

    def test_source_change_stales_receipt(self):
        self.initialize()
        self.begin_and_check()
        (self.root / "src.txt").write_text("changed\n")
        result = self.ctl("verify")
        self.assertEqual(result.returncode, 5)
        self.assertIn("stale sourceDigest", result.stderr)

    def test_changed_check_stales_runtime_contract(self):
        contract = self.initialize()
        self.begin_and_check()
        contract["checks"][0]["timeoutSeconds"] = 9
        (self.root / ".amanar/workflow.json").write_text(json.dumps(contract))
        result = self.ctl("verify")
        self.assertEqual(result.returncode, 5)
        self.assertIn("contract changed", result.stderr)

    def test_tampered_check_hash_is_rejected(self):
        self.initialize()
        self.begin_and_check()
        path = self.root / ".amanar/run/receipts/tests.json"
        receipt = json.loads(path.read_text())
        receipt["checkDefinitionHash"] = "0" * 64
        path.write_text(json.dumps(receipt))
        result = self.ctl("verify")
        self.assertEqual(result.returncode, 5)
        self.assertIn("checkDefinitionHash", result.stderr)

    def test_incomplete_receipt_shape_is_rejected(self):
        self.initialize()
        self.begin_and_check()
        path = self.root / ".amanar/run/receipts/tests.json"
        receipt = json.loads(path.read_text())
        del receipt["stdoutSha256"]
        path.write_text(json.dumps(receipt))
        result = self.ctl("verify")
        self.assertEqual(result.returncode, 5)
        self.assertIn("fields are invalid", result.stderr)

    def test_missing_controller_output_rejects_plausible_receipt(self):
        self.initialize()
        self.begin_and_check()
        (self.root / ".amanar/run/output/tests.stdout").unlink()
        (self.root / ".amanar/run/output/tests.stderr").unlink()
        result = self.ctl("verify")
        self.assertEqual(result.returncode, 5)
        self.assertIn("stored output", result.stderr)

    def test_tampered_controller_output_rejects_receipt(self):
        self.initialize()
        self.begin_and_check()
        (self.root / ".amanar/run/output/tests.stdout").write_text("forged\n")
        result = self.ctl("verify")
        self.assertEqual(result.returncode, 5)
        self.assertIn("stdout digest", result.stderr)

    def test_out_of_scope_change_is_rejected_before_check(self):
        self.initialize()
        self.assertEqual(self.ctl("begin").returncode, 0)
        (self.root / "outside.txt").write_text("not allowed\n")
        result = self.ctl("run-check", "tests")
        self.assertEqual(result.returncode, 5)
        self.assertIn("out-of-scope", result.stderr)

    def test_check_created_out_of_scope_file_is_rejected(self):
        contract = base_contract()
        contract["checks"][0].update({
            "command": "touch outside.txt", "minTests": 0, "testParser": "none",
            "outputContains": [],
        })
        self.initialize(contract)
        self.assertEqual(self.ctl("begin").returncode, 0)
        result = self.ctl("run-check", "tests")
        self.assertEqual(result.returncode, 5)
        self.assertIn("out-of-scope", result.stderr)

    def test_check_created_ignored_out_of_scope_file_is_rejected(self):
        (self.root / ".gitignore").write_text("ignored.tmp\n")
        contract = base_contract()
        contract["checks"][0].update({
            "command": "touch ignored.tmp", "minTests": 0, "testParser": "none",
            "outputContains": [],
        })
        self.initialize(contract)
        self.assertEqual(self.ctl("begin").returncode, 0)
        result = self.ctl("run-check", "tests")
        self.assertEqual(result.returncode, 5)
        self.assertIn("out-of-scope", result.stderr)

    def test_excluded_change_is_rejected(self):
        contract = base_contract()
        contract["scope"] = ["src/", "result.txt"]
        contract["exclusions"] = ["src/vendor/"]
        (self.root / "src/vendor").mkdir(parents=True)
        (self.root / "src/vendor/file.txt").write_text("original\n")
        self.initialize(contract)
        self.assertEqual(self.ctl("begin").returncode, 0)
        (self.root / "src/vendor/file.txt").write_text("changed\n")
        result = self.ctl("run-check", "tests")
        self.assertEqual(result.returncode, 5)
        self.assertIn("excluded path", result.stderr)

    def test_missing_artifact_is_rejected_at_verify(self):
        self.initialize()
        self.begin_and_check()
        (self.root / "result.txt").unlink()
        result = self.ctl("verify")
        self.assertEqual(result.returncode, 5)
        self.assertIn("artifacts missing", result.stderr)

    def test_timeout_kills_process_group_and_child_sentinel(self):
        script = self.root / "timeout_parent.py"
        script.write_text(
            "import subprocess, sys, time\n"
            "subprocess.Popen([sys.executable, '-c', \"import time; time.sleep(0.5); open('sentinel','w').write('bad')\"])\n"
            "time.sleep(5)\n"
        )
        contract = base_contract()
        contract["checks"][0].update({
            "command": "python3 timeout_parent.py", "timeoutSeconds": 0.1,
            "minTests": 0, "testParser": "none", "outputContains": [],
        })
        self.initialize(contract)
        self.assertEqual(self.ctl("begin").returncode, 0)
        result = self.ctl("run-check", "tests")
        self.assertEqual(result.returncode, 4)
        self.assertIn("timed out", result.stderr)
        time.sleep(0.7)
        self.assertFalse((self.root / "sentinel").exists())

    def test_timeout_kills_detached_child_sentinel(self):
        script = self.root / "timeout_detached.py"
        script.write_text(
            "import subprocess, sys, time\n"
            "subprocess.Popen([sys.executable, '-c', \"import time; time.sleep(0.5); open('detached-sentinel','w').write('bad')\"], start_new_session=True)\n"
            "time.sleep(5)\n"
        )
        contract = base_contract()
        contract["checks"][0].update({
            "command": "python3 timeout_detached.py", "timeoutSeconds": 0.1,
            "minTests": 0, "testParser": "none", "outputContains": [],
        })
        self.initialize(contract)
        self.assertEqual(self.ctl("begin").returncode, 0)
        result = self.ctl("run-check", "tests")
        self.assertEqual(result.returncode, 4)
        time.sleep(0.7)
        self.assertFalse((self.root / "detached-sentinel").exists())

    def test_block_and_resume_are_explicit(self):
        self.initialize()
        self.assertEqual(self.ctl("begin").returncode, 0)
        self.assertEqual(self.ctl("block", "--reason", "dependency unavailable").returncode, 0)
        self.assertEqual(self.ctl("run-check", "tests").returncode, 6)
        resumed = self.ctl("begin")
        self.assertEqual(resumed.returncode, 0)
        self.assertIn("blocked -> implementing", resumed.stdout)

    def test_unknown_check_and_duplicate_begin_are_incomplete(self):
        self.initialize()
        self.assertEqual(self.ctl("begin").returncode, 0)
        self.assertEqual(self.ctl("run-check", "missing").returncode, 6)
        self.assertEqual(self.ctl("begin").returncode, 6)

    def test_verified_is_derived_when_source_later_changes(self):
        self.initialize()
        self.begin_and_check()
        self.assertEqual(self.ctl("verify").returncode, 0)
        (self.root / "src.txt").write_text("later\n")
        status = self.ctl("status", "--json")
        record = json.loads(status.stdout)
        self.assertEqual(record["recordedStatus"], "verified")
        self.assertEqual(record["status"], "implementing")
        self.assertFalse(record["current"])

    def test_head_change_after_begin_is_rejected(self):
        self.initialize()
        self.assertEqual(self.ctl("begin").returncode, 0)
        (self.root / "src.txt").write_text("committed change\n")
        subprocess.run(["git", "add", "src.txt"], cwd=self.root, check=True)
        subprocess.run(["git", "commit", "-qm", "change head"], cwd=self.root, check=True)
        result = self.ctl("run-check", "tests")
        self.assertEqual(result.returncode, 5)
        self.assertIn("HEAD changed", result.stderr)


if __name__ == "__main__":
    unittest.main()
