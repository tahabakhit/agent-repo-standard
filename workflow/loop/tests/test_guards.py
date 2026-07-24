"""Tests for workflow/loop/guards.py.

All tests operate entirely inside tempfile.TemporaryDirectory instances.
No files outside the temp dir are touched.
"""
import sys
import tempfile
import unittest
from pathlib import Path

# Make the loop package importable
_LOOP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_LOOP))

import guards  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_contract(scope: list[str], exclusions: list[str] | None = None) -> dict:
    return {
        "scope": scope,
        "exclusions": exclusions or [],
        "checks": [],
    }


# ---------------------------------------------------------------------------
# snapshot_tests
# ---------------------------------------------------------------------------


class SnapshotTestsCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_captures_test_file_in_scope(self):
        (self.root / "test_foo.py").write_text("assert True\n")
        snap = guards.snapshot_tests(self.root, make_contract(["test_foo.py"]))
        self.assertIn("test_foo.py", snap)
        self.assertIsInstance(snap["test_foo.py"], str)
        self.assertEqual(len(snap["test_foo.py"]), 64)  # sha256 hex

    def test_ignores_non_test_files(self):
        (self.root / "main.py").write_text("x = 1\n")
        snap = guards.snapshot_tests(self.root, make_contract(["main.py"]))
        self.assertEqual(snap, {})

    def test_captures_test_files_inside_scoped_directory(self):
        src = self.root / "src"
        src.mkdir()
        (src / "test_core.py").write_text("assert 1\n")
        (src / "utils.py").write_text("def f(): pass\n")
        snap = guards.snapshot_tests(self.root, make_contract(["src"]))
        self.assertIn("src/test_core.py", snap)
        self.assertNotIn("src/utils.py", snap)

    def test_captures_file_under_tests_directory(self):
        t = self.root / "tests"
        t.mkdir()
        (t / "check.py").write_text("assert True\n")
        snap = guards.snapshot_tests(self.root, make_contract(["tests"]))
        self.assertIn("tests/check.py", snap)

    def test_out_of_scope_test_file_not_captured(self):
        (self.root / "test_other.py").write_text("assert True\n")
        (self.root / "work.txt").write_text("content\n")
        snap = guards.snapshot_tests(self.root, make_contract(["work.txt"]))
        self.assertEqual(snap, {})

    def test_empty_scope_yields_empty_snapshot(self):
        (self.root / "test_foo.py").write_text("assert True\n")
        snap = guards.snapshot_tests(self.root, make_contract([]))
        self.assertEqual(snap, {})


# ---------------------------------------------------------------------------
# detect_test_tampering
# ---------------------------------------------------------------------------


class DetectTestTamperingCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _contract(self, scope=None):
        return make_contract(scope or ["tests"])

    def _setup_test_file(self, rel: str, content: str) -> Path:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        return path

    def test_clean_no_offenders(self):
        self._setup_test_file("tests/test_a.py", "assert True\n")
        contract = self._contract()
        baseline = guards.snapshot_tests(self.root, contract)
        offenders = guards.detect_test_tampering(self.root, contract, baseline)
        self.assertEqual(offenders, [])

    def test_modified_test_file_is_flagged(self):
        path = self._setup_test_file("tests/test_a.py", "assert True\n")
        contract = self._contract()
        baseline = guards.snapshot_tests(self.root, contract)
        # agent weakens the test
        path.write_text("# emptied by agent\n")
        offenders = guards.detect_test_tampering(self.root, contract, baseline)
        self.assertIn("tests/test_a.py", offenders)

    def test_deleted_test_file_is_flagged(self):
        path = self._setup_test_file("tests/test_a.py", "assert True\n")
        contract = self._contract()
        baseline = guards.snapshot_tests(self.root, contract)
        path.unlink()
        offenders = guards.detect_test_tampering(self.root, contract, baseline)
        self.assertIn("tests/test_a.py", offenders)

    def test_unmodified_file_not_flagged(self):
        self._setup_test_file("tests/test_a.py", "assert True\n")
        self._setup_test_file("tests/test_b.py", "assert False is False\n")
        contract = self._contract()
        baseline = guards.snapshot_tests(self.root, contract)
        # only test_b is modified
        (self.root / "tests" / "test_b.py").write_text("# weakened\n")
        offenders = guards.detect_test_tampering(self.root, contract, baseline)
        self.assertIn("tests/test_b.py", offenders)
        self.assertNotIn("tests/test_a.py", offenders)

    def test_empty_baseline_never_flags(self):
        # No test files in scope: baseline is empty, nothing can be flagged
        (self.root / "work.txt").write_text("content\n")
        contract = make_contract(["work.txt"])
        baseline = guards.snapshot_tests(self.root, contract)
        self.assertEqual(baseline, {})
        offenders = guards.detect_test_tampering(self.root, contract, baseline)
        self.assertEqual(offenders, [])

    def test_new_test_file_added_is_not_flagged(self):
        # Adding a NEW test file is not considered tampering (only deletions/changes)
        self._setup_test_file("tests/test_a.py", "assert True\n")
        contract = self._contract()
        baseline = guards.snapshot_tests(self.root, contract)
        # agent adds a second test file
        (self.root / "tests" / "test_new.py").write_text("assert True\n")
        offenders = guards.detect_test_tampering(self.root, contract, baseline)
        self.assertEqual(offenders, [])

    def test_result_is_sorted(self):
        self._setup_test_file("tests/test_z.py", "a\n")
        self._setup_test_file("tests/test_a.py", "b\n")
        contract = self._contract()
        baseline = guards.snapshot_tests(self.root, contract)
        (self.root / "tests" / "test_z.py").write_text("changed\n")
        (self.root / "tests" / "test_a.py").write_text("changed\n")
        offenders = guards.detect_test_tampering(self.root, contract, baseline)
        self.assertEqual(offenders, sorted(offenders))


# ---------------------------------------------------------------------------
# detect_placeholders
# ---------------------------------------------------------------------------


class DetectPlaceholdersCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _write(self, rel: str, content: str) -> Path:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        return path

    def _contract(self, scope=None):
        return make_contract(scope or ["src"])

    def _offending_markers(self, contract=None) -> list[str]:
        c = contract or self._contract()
        return [m for _, m in guards.detect_placeholders(self.root, c)]

    def _offending_paths(self, contract=None) -> list[str]:
        c = contract or self._contract()
        return [p for p, _ in guards.detect_placeholders(self.root, c)]

    def test_clean_file_no_offenders(self):
        self._write("src/impl.py", "def add(a, b):\n    return a + b\n")
        self.assertEqual(guards.detect_placeholders(self.root, self._contract()), [])

    def test_raise_not_implemented_error_detected(self):
        self._write("src/impl.py", "def run():\n    raise NotImplementedError\n")
        self.assertIn("raise NotImplementedError", self._offending_markers())

    def test_todo_detected(self):
        self._write("src/impl.py", "# TODO: implement this\nx = 1\n")
        self.assertIn("TODO", self._offending_markers())

    def test_fixme_detected(self):
        self._write("src/impl.py", "# FIXME: broken logic\n")
        self.assertIn("FIXME", self._offending_markers())

    def test_bare_pass_detected(self):
        self._write("src/impl.py", "def run():\n    pass\n")
        self.assertIn("pass", self._offending_markers())

    def test_pass_with_comment_detected(self):
        self._write("src/impl.py", "def run():\n    pass  # placeholder\n")
        self.assertIn("pass", self._offending_markers())

    def test_standalone_ellipsis_detected(self):
        self._write("src/impl.py", "def run():\n    ...\n")
        self.assertIn("...", self._offending_markers())

    def test_ellipsis_with_comment_detected(self):
        self._write("src/impl.py", "def run():\n    ...  # stub\n")
        self.assertIn("...", self._offending_markers())

    def test_test_files_are_excluded(self):
        # A placeholder inside a test file must NOT be flagged
        self._write("src/test_impl.py", "def test_thing():\n    raise NotImplementedError\n")
        self.assertEqual(guards.detect_placeholders(self.root, self._contract()), [])

    def test_tests_directory_files_excluded(self):
        contract = make_contract(["tests"])
        self._write("tests/test_check.py", "def test_x():\n    ...\n")
        self.assertEqual(guards.detect_placeholders(self.root, contract), [])

    def test_amanar_directory_excluded(self):
        # Files under .amanar/ must never be scanned
        amanar = self.root / ".amanar"
        amanar.mkdir()
        (amanar / "config.py").write_text("# TODO internal\n")
        contract = make_contract([".amanar"])
        self.assertEqual(guards.detect_placeholders(self.root, contract), [])

    def test_out_of_scope_file_ignored(self):
        # placeholder in a file outside the contract scope is not flagged
        self._write("other/impl.py", "raise NotImplementedError\n")
        self.assertEqual(guards.detect_placeholders(self.root, self._contract()), [])

    def test_returns_path_and_marker(self):
        self._write("src/impl.py", "raise NotImplementedError\n")
        result = guards.detect_placeholders(self.root, self._contract())
        self.assertEqual(len(result), 1)
        path, marker = result[0]
        self.assertIn("impl.py", path)
        self.assertEqual(marker, "raise NotImplementedError")

    def test_at_most_one_entry_per_file(self):
        # File has multiple markers — only the first is returned
        self._write("src/impl.py", "# TODO: fix\nraise NotImplementedError\n")
        result = guards.detect_placeholders(self.root, self._contract())
        paths = [p for p, _ in result]
        self.assertEqual(len(paths), len(set(paths)))  # no duplicate paths

    def test_multiple_files_each_flagged(self):
        self._write("src/a.py", "raise NotImplementedError\n")
        self._write("src/b.py", "# TODO\n")
        result = guards.detect_placeholders(self.root, self._contract())
        paths = {p for p, _ in result}
        self.assertIn("src/a.py", paths)
        self.assertIn("src/b.py", paths)

    def test_ellipsis_in_slice_not_flagged(self):
        # An ellipsis inside an expression (e.g. slicing) is not a standalone stmt
        self._write("src/impl.py", "x = arr[..., 0]\n")
        self.assertEqual(guards.detect_placeholders(self.root, self._contract()), [])

    def test_pass_in_middle_of_code_still_flagged(self):
        # Any bare pass line is a placeholder marker regardless of context
        self._write("src/impl.py", "def f():\n    x = 1\n    pass\n    return x\n")
        self.assertIn("pass", self._offending_markers())


# ---------------------------------------------------------------------------
# _is_test_file (internal helper, tested through public API above but also
# exercised directly for completeness)
# ---------------------------------------------------------------------------


class IsTestFileCase(unittest.TestCase):
    def _rel(self, s: str) -> Path:
        return Path(s)

    def test_test_underscore_prefix(self):
        self.assertTrue(guards._is_test_file(self._rel("test_foo.py")))

    def test_underscore_test_suffix(self):
        self.assertTrue(guards._is_test_file(self._rel("foo_test.py")))

    def test_dot_test_extension(self):
        self.assertTrue(guards._is_test_file(self._rel("foo.test.js")))

    def test_inside_tests_dir(self):
        self.assertTrue(guards._is_test_file(self._rel("tests/check.py")))
        self.assertTrue(guards._is_test_file(self._rel("src/tests/check.py")))

    def test_ordinary_file(self):
        self.assertFalse(guards._is_test_file(self._rel("main.py")))
        self.assertFalse(guards._is_test_file(self._rel("src/utils.py")))


if __name__ == "__main__":
    unittest.main()
