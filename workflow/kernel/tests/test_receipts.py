import copy
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from amanar_workflow.contract import check_hash, workflow_hash
from amanar_workflow.errors import WorkflowError
from amanar_workflow.receipts import _file_digest, receipt_problem, source_snapshot
from amanar_workflow.state import read
from test_controller import base_contract


def valid_receipt(contract):
    check = contract["checks"][0]
    return {
        "receiptVersion": "1.0.0", "workflowId": contract["id"],
        "workflowHash": workflow_hash(contract), "checkId": check["id"],
        "checkDefinitionHash": check_hash(check), "sourceDigest": "a" * 64,
        "command": check["command"], "exitCode": check["expectedExit"],
        "discoveredTests": check["minTests"], "stdoutSha256": "b" * 64,
        "stderrSha256": "c" * 64, "stdoutTruncated": False,
        "stderrTruncated": False, "timedOut": False, "passed": True,
        "recordedAt": datetime.now(timezone.utc).isoformat(),
    }


class ReceiptValidationTests(unittest.TestCase):
    def test_valid_receipt_is_current(self):
        contract = base_contract()
        self.assertIsNone(receipt_problem(valid_receipt(contract), contract, contract["checks"][0], "a" * 64))

    def test_each_receipt_gate_rejects(self):
        contract = base_contract()
        changes = [
            ("receiptVersion", "2", "identity"),
            ("stdoutSha256", "bad", "digest"),
            ("discoveredTests", "one", "test count is invalid"),
            ("timedOut", 0, "boolean"),
            ("recordedAt", "yesterday", "timestamp"),
            ("workflowHash", "d" * 64, "stale workflowHash"),
            ("passed", False, "did not pass"),
            ("exitCode", 1, "exit code"),
            ("discoveredTests", None, "test count is insufficient"),
        ]
        for field, value, expected in changes:
            receipt = valid_receipt(contract)
            receipt[field] = value
            with self.subTest(field=field, value=value):
                self.assertIn(expected, receipt_problem(receipt, contract, contract["checks"][0], "a" * 64))

    def test_git_and_symlink_source_branches(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(WorkflowError):
                source_snapshot(root)
            target = root / "target"
            target.write_text("value")
            link = root / "link"
            link.symlink_to(target.name)
            self.assertNotEqual(_file_digest(link), _file_digest(target))

    def test_state_rejects_malformed_and_unknown_status(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "state.json"
            path.write_text("{")
            with self.assertRaises(WorkflowError):
                read(path)
            path.write_text('{"status":"invented"}')
            with self.assertRaises(WorkflowError):
                read(path)


if __name__ == "__main__":
    unittest.main()
