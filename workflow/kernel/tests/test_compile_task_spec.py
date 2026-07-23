import json
import sys
import tempfile
import unittest
from pathlib import Path

KERNEL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(KERNEL / "tools"))

import compile_task_spec as compiler  # noqa: E402
from amanar_workflow.errors import ContractError  # noqa: E402


def spec(**overrides):
    base = {
        "id": "demo",
        "goal": "do the thing",
        "scope": ["src/"],
        "artifacts": ["src/out.txt"],
        "blastRadius": {"writes": True, "exclusions": ["src/vendor/"]},
        "verify": [{
            "id": "tests", "run": "python3 -m unittest discover -s tests -v",
            "contains": ["OK"], "minTests": 1, "parser": "unittest",
        }],
    }
    base.update(overrides)
    return base


class CompileTaskSpecTests(unittest.TestCase):
    def test_maps_rpi_fields_to_contract(self):
        contract = compiler.compile_spec(spec())
        self.assertEqual(contract["objective"], "do the thing")
        self.assertEqual(contract["scope"], ["src/"])
        self.assertEqual(contract["exclusions"], ["src/vendor/"])
        self.assertEqual(contract["authority"], {"repositoryWrites": True, "liveEffects": False})
        check = contract["checks"][0]
        self.assertEqual(check["command"], "python3 -m unittest discover -s tests -v")
        self.assertEqual(check["expectedExit"], 0)

    def test_fills_defaults_for_minimal_spec(self):
        contract = compiler.compile_spec(
            {"id": "m", "goal": "g", "scope": ["a.txt"], "verify": [{"id": "c", "run": "true"}]}
        )
        check = contract["checks"][0]
        self.assertEqual(check["timeoutSeconds"], 120)
        self.assertEqual(check["minTests"], 0)
        self.assertEqual(check["testParser"], "none")
        self.assertFalse(check["liveEffect"])
        self.assertEqual(contract["exclusions"], [])
        self.assertEqual(contract["artifacts"], [])
        self.assertTrue(contract["authority"]["repositoryWrites"])

    def test_unknown_spec_field_is_rejected(self):
        with self.assertRaises(compiler.SpecError):
            compiler.compile_spec(spec(oops=1))

    def test_unknown_verify_field_is_rejected(self):
        bad = spec()
        bad["verify"][0]["timoeut"] = 5
        with self.assertRaises(compiler.SpecError):
            compiler.compile_spec(bad)

    def test_missing_required_field_is_rejected(self):
        with self.assertRaises(compiler.SpecError):
            compiler.compile_spec({"id": "x", "scope": ["a.txt"], "verify": [{"id": "c", "run": "true"}]})

    def test_mintests_without_parser_fails_contract(self):
        with self.assertRaises(ContractError):
            compiler.compile_spec(
                {"id": "x", "goal": "g", "scope": ["a.txt"], "verify": [{"id": "c", "run": "true", "minTests": 2}]}
            )

    def test_main_writes_validated_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            spec_path = Path(directory) / "spec.json"
            spec_path.write_text(json.dumps(spec()))
            out = Path(directory) / "workflow.json"
            compiler.main([str(spec_path), "--out", str(out)])
            data = json.loads(out.read_text())
            self.assertEqual(data["id"], "demo")
            self.assertEqual(data["schemaVersion"], "1.0.0")


if __name__ == "__main__":
    unittest.main()
