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
        (self.root / "work.txt").write_text("PENDING\n")

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
        (self.root / "work.txt").write_text("PENDING\n")
        self.assertFalse(run_loop.passes_k(self.root, base_contract(), 1))


# ---------------------------------------------------------------------------
# Guard integration tests
# ---------------------------------------------------------------------------


def base_contract_with_tests(check=None):
    """Contract whose scope includes a tests/ directory alongside work.txt."""
    return {
        **base_contract(check),
        "scope": ["work.txt", "tests/"],
    }


class GuardIntegrationCase(RunLoopTestCase):
    """Integration tests verifying structural guards inside the bounded loop."""

    def vendor_with_test_file(self, test_content="assert True\n", contract=None):
        """Set up fixture with a real test file in scope."""
        tests_dir = self.root / "tests"
        tests_dir.mkdir(exist_ok=True)
        (tests_dir / "test_core.py").write_text(test_content)
        self.vendor(contract or base_contract_with_tests())

    def test_tampered_test_file_outcome_is_not_verified(self):
        """Agent that weakens a test must not reach 'verified'."""
        self.vendor_with_test_file()
        def agent(*_):
            (self.root / "work.txt").write_text("DONE\n")
            (self.root / "tests" / "test_core.py").write_text("# emptied\n")
            return 0, "done"
        result = self.run_loop(agent, contract=base_contract_with_tests())
        self.assertNotEqual(result["outcome"], "verified")
        self.assertEqual(result["outcome"], "test-tampering")

    def test_deleted_test_file_outcome_is_not_verified(self):
        """Agent that deletes a test must not reach 'verified'."""
        self.vendor_with_test_file()
        def agent(*_):
            (self.root / "work.txt").write_text("DONE\n")
            target = self.root / "tests" / "test_core.py"
            if target.exists():
                target.unlink()
            return 0, "done"
        result = self.run_loop(agent, contract=base_contract_with_tests())
        self.assertNotEqual(result["outcome"], "verified")
        self.assertEqual(result["outcome"], "test-tampering")

    def test_tampered_test_failing_info_feeds_next_prompt(self):
        """Guard failure message appears in last_failing for the next iteration."""
        self.vendor_with_test_file()
        prompts: list[str] = []
        calls = {"n": 0}
        def agent(_host, _root, prompt, *_):
            prompts.append(prompt)
            calls["n"] += 1
            if calls["n"] == 1:
                # First iteration: tamper with the test
                (self.root / "tests" / "test_core.py").write_text("# removed\n")
            else:
                # Second iteration: restore test and fix work.txt
                (self.root / "tests" / "test_core.py").write_text("assert True\n")
                (self.root / "work.txt").write_text("DONE\n")
            return 0, "ok"
        result = self.run_loop(agent, contract=base_contract_with_tests(), max_iterations=4)
        # Second prompt must mention the tampering
        self.assertGreater(len(prompts), 1)
        self.assertIn("Test files modified or deleted", prompts[1])
        self.assertEqual(result["outcome"], "verified")

    def test_placeholder_code_prevents_verified(self):
        """Agent that leaves raise NotImplementedError must not reach 'verified'."""
        self.vendor()
        def agent(*_):
            # Would satisfy the DONE check but leaves a placeholder
            (self.root / "work.txt").write_text("DONE\nraise NotImplementedError\n")
            return 0, "done"
        result = self.run_loop(agent)
        self.assertNotEqual(result["outcome"], "verified")
        self.assertEqual(result["outcome"], "placeholder-detected")

    def test_todo_in_scope_file_prevents_verified(self):
        """Agent that writes a TODO comment must not reach 'verified'."""
        self.vendor()
        def agent(*_):
            (self.root / "work.txt").write_text("DONE\n# TODO: finish this\n")
            return 0, "done"
        result = self.run_loop(agent)
        self.assertNotEqual(result["outcome"], "verified")
        self.assertEqual(result["outcome"], "placeholder-detected")

    def test_placeholder_fixed_eventually_verifies(self):
        """After the guard fires once, a clean next iteration can verify."""
        self.vendor()
        calls = {"n": 0}
        def agent(*_):
            calls["n"] += 1
            if calls["n"] == 1:
                # First attempt: placeholder left in scope file
                (self.root / "work.txt").write_text("DONE\nraise NotImplementedError\n")
            else:
                # Second attempt: clean implementation
                (self.root / "work.txt").write_text("DONE\n")
            return 0, "step"
        result = self.run_loop(agent, max_iterations=4)
        self.assertEqual(result["outcome"], "verified")
        self.assertEqual(result["iterations"], 2)

    def test_tamper_then_fix_then_verify(self):
        """Agent that first tampers with tests, then restores and fixes, verifies."""
        self.vendor_with_test_file()
        calls = {"n": 0}
        def agent(*_):
            calls["n"] += 1
            if calls["n"] == 1:
                # First attempt: tamper
                (self.root / "tests" / "test_core.py").write_text("# broken\n")
                (self.root / "work.txt").write_text("DONE\n")
            else:
                # Second attempt: restore test and keep fix
                (self.root / "tests" / "test_core.py").write_text("assert True\n")
                (self.root / "work.txt").write_text("DONE\n")
            return 0, "ok"
        result = self.run_loop(agent, contract=base_contract_with_tests(), max_iterations=4)
        self.assertEqual(result["outcome"], "verified")

    def test_legitimate_implementation_passes_guards(self):
        """A clean implementation without placeholders or test changes verifies."""
        self.vendor()
        def agent(*_):
            (self.root / "work.txt").write_text("DONE\n")
            return 0, "clean"
        result = self.run_loop(agent)
        self.assertEqual(result["outcome"], "verified")
        self.assertEqual(result["iterations"], 1)

    def test_guards_do_not_false_positive_on_clean_state(self):
        """After multiple noop iterations, no guard-failure outcome is raised
        when no placeholder markers exist in scope files."""
        self.vendor()
        # work.txt starts as "PENDING\n" — no placeholder markers
        result = self.run_loop(lambda *_: (0, "noop"), max_iterations=3)
        # Outcome is 'exhausted' (checks fail), NOT a guard outcome
        self.assertEqual(result["outcome"], "exhausted")
        self.assertEqual(result["iterations"], 3)


if __name__ == "__main__":
    unittest.main()
