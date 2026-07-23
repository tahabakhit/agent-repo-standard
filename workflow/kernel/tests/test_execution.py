import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from amanar_workflow.execution import parse_tests


class TestParserTests(unittest.TestCase):
    def test_unittest(self):
        self.assertEqual(parse_tests("unittest", "Ran 12 tests in 0.1s"), 12)

    def test_pytest(self):
        self.assertEqual(parse_tests("pytest", "12 passed, 1 warning in 0.2s"), 12)

    def test_tap(self):
        self.assertEqual(parse_tests("tap", "TAP version 13\nok 1\n1..1\n"), 1)

    def test_missing_discovery_is_not_zero(self):
        self.assertIsNone(parse_tests("unittest", "OK"))
        self.assertEqual(parse_tests("none", "anything"), 0)


if __name__ == "__main__":
    unittest.main()
