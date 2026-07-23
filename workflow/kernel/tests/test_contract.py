import copy
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

KERNEL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(KERNEL))

from amanar_workflow.contract import TOP_FIELDS, load, validate
from amanar_workflow.errors import ContractError


class ContractFixtureTests(unittest.TestCase):
    def setUp(self):
        self.fixtures = Path(__file__).parent / "fixtures"
        self.valid_path = self.fixtures / "valid" / "basic.json"
        self.valid = json.loads(self.valid_path.read_text())

    def test_valid_fixtures(self):
        for path in (self.fixtures / "valid").glob("*.json"):
            with self.subTest(path=path.name):
                self.assertEqual(load(path)["schemaVersion"], "1.0.0")

    def test_invalid_fixtures(self):
        paths = list((self.fixtures / "invalid").glob("*.json"))
        self.assertGreaterEqual(len(paths), 8)
        for path in paths:
            with self.subTest(path=path.name), self.assertRaises(ContractError):
                load(path)

    def test_schema_and_controller_public_fields_match(self):
        schema = json.loads((KERNEL / "schema" / "workflow.schema.json").read_text())
        self.assertEqual(set(schema["required"]), TOP_FIELDS)
        self.assertFalse(schema["additionalProperties"])

    def test_schema_encodes_shared_path_and_parser_constraints(self):
        schema = json.loads((KERNEL / "schema" / "workflow.schema.json").read_text())
        path_schema = schema["$defs"]["repositoryPath"]
        pattern = re.compile(path_schema["pattern"])
        for field in ("scope", "exclusions", "artifacts"):
            self.assertEqual(schema["properties"][field]["items"], {"$ref": "#/$defs/repositoryPath"})
        for value in ("src/file.py", "src/"):
            self.assertIsNotNone(pattern.fullmatch(value))
        for value in ("../outside", "/absolute", ".git/config", ".amanar/run/state.json", "a//b"):
            self.assertIsNone(pattern.fullmatch(value))
        conditional = schema["properties"]["checks"]["items"]["allOf"]
        self.assertIn({
            "if": {"properties": {"minTests": {"minimum": 1}}, "required": ["minTests"]},
            "then": {"properties": {"testParser": {"not": {"const": "none"}}}},
        }, conditional)

    def test_contract_documents_live_effect_author_trust_boundary(self):
        text = (KERNEL / "docs" / "contract.md").read_text()
        self.assertIn("contract author", text.lower())
        self.assertIn("does not infer", text.lower())

    def test_project_local_controller_has_exact_version_pin(self):
        version = (KERNEL / "VERSION").read_text().strip()
        namespace = {}
        exec((KERNEL / "amanar_workflow" / "__init__.py").read_text(), namespace)
        self.assertEqual(version, namespace["__version__"])
        readme = (KERNEL / "README.md").read_text()
        self.assertIn(".amanar/kernel/VERSION", readme)

    def test_authority_requires_real_booleans(self):
        for value in (0, 1, "true", None):
            data = copy.deepcopy(self.valid)
            data["authority"]["repositoryWrites"] = value
            with self.subTest(value=value), self.assertRaises(ContractError):
                validate(data)

    def test_artifact_must_be_in_scope_and_not_excluded(self):
        data = copy.deepcopy(self.valid)
        data["artifacts"] = ["elsewhere.txt"]
        with self.assertRaises(ContractError):
            validate(data)
        data["artifacts"] = ["src/vendor/file.txt"]
        with self.assertRaises(ContractError):
            validate(data)

    def test_timeout_and_exit_are_bounded(self):
        for field, value in (("timeoutSeconds", 0), ("timeoutSeconds", 3601), ("expectedExit", -1), ("expectedExit", 256)):
            data = copy.deepcopy(self.valid)
            data["checks"][0][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ContractError):
                validate(data)

    def test_remaining_shape_and_path_invariants(self):
        cases = []

        def case(change):
            data = copy.deepcopy(self.valid)
            change(data)
            cases.append(data)

        case(lambda data: data.update(id="Bad Id"))
        case(lambda data: data.update(objective=" "))
        case(lambda data: data.update(scope=[]))
        case(lambda data: data.update(exclusions="not-an-array"))
        case(lambda data: data.update(scope=["x", "x"]))
        for path in (" x", "/x", ".git/config", ".amanar/run/state.json", "a//b"):
            case(lambda data, path=path: data.update(scope=[path]))
        case(lambda data: data.update(authority=[]))
        case(lambda data: data.update(checks=[]))
        case(lambda data: data.update(checks=["not-an-object"]))
        case(lambda data: data["checks"][0].update(id="Bad"))
        case(lambda data: data["checks"][0].update(outputContains=[""]))
        case(lambda data: data["checks"][0].update(testParser="unknown"))
        case(lambda data: data["checks"][0].update(liveEffect=0))
        case(lambda data: data["checks"][0].update(minTests=True))
        case(lambda data: data["checks"][0].update(timeoutSeconds=True))
        case(lambda data: data["checks"][0].update(expectedExit=True))
        cases.append([])
        for index, data in enumerate(cases):
            with self.subTest(index=index), self.assertRaises(ContractError):
                validate(data)

    def test_load_rejects_missing_and_malformed_json(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(ContractError):
                load(root / "missing.json")
            malformed = root / "bad.json"
            malformed.write_text("{")
            with self.assertRaises(ContractError):
                load(malformed)


if __name__ == "__main__":
    unittest.main()
