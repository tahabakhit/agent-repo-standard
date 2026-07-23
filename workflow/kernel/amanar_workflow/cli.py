"""Stable CLI for the Amanar workflow controller."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from . import __version__
from .contract import check_hash, load, workflow_hash
from .errors import AuthorityError, CheckError, EvidenceError, IncompleteError, WorkflowError
from .execution import run
from .receipts import assert_artifacts, assert_scope, output_problem, receipt_problem, source_snapshot
from .state import now, read as read_state, require, write


def paths(root: Path) -> dict[str, Path]:
    control = root / ".amanar"
    run_dir = control / "run"
    return {
        "contract": control / "workflow.json",
        "run": run_dir,
        "state": run_dir / "state.json",
        "receipts": run_dir / "receipts",
    }


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise EvidenceError(f"cannot read receipt {path.name}: {exc}") from exc
    if not isinstance(value, dict):
        raise EvidenceError(f"receipt is not an object: {path.name}")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def context(root: Path) -> tuple[dict[str, Any], dict[str, Path], dict[str, Any] | None]:
    location = paths(root)
    contract = load(location["contract"])
    state = read_state(location["state"])
    if state is not None:
        if state.get("workflowId") != contract["id"]:
            raise EvidenceError("runtime state belongs to another workflow")
        if state.get("workflowHash") != workflow_hash(contract):
            raise EvidenceError("workflow contract changed after begin")
    return contract, location, state


def find_check(contract: dict[str, Any], check_id: str) -> dict[str, Any]:
    check = next((item for item in contract["checks"] if item["id"] == check_id), None)
    if check is None:
        raise IncompleteError(f"unknown check: {check_id}")
    return check


def cmd_validate(root: Path) -> None:
    contract = load(paths(root)["contract"])
    print(f"AMANAR_VALID id={contract['id']} hash={workflow_hash(contract)}")


def cmd_begin(root: Path) -> None:
    contract, location, state = context(root)
    if not contract["authority"]["repositoryWrites"]:
        raise AuthorityError("repository writes are not authorized")
    require(state, "planned", "blocked")
    if state is None:
        state = {
            "workflowId": contract["id"],
            "workflowHash": workflow_hash(contract),
            "status": "planned",
            "baseline": source_snapshot(root),
            "createdAt": now(),
        }
    previous = state["status"]
    state.update({"status": "implementing", "updatedAt": now()})
    state.pop("blockReason", None)
    write(location["state"], state)
    print(f"AMANAR_STATE {previous} -> implementing")


def cmd_block(root: Path, reason: str) -> None:
    _, location, state = context(root)
    state = require(state, "implementing")
    state.update({"status": "blocked", "blockReason": reason, "updatedAt": now()})
    write(location["state"], state)
    print("AMANAR_STATE implementing -> blocked")


def cmd_run_check(root: Path, check_id: str) -> None:
    contract, location, state = context(root)
    state = require(state, "implementing")
    check = find_check(contract, check_id)
    if check["liveEffect"] and not contract["authority"]["liveEffects"]:
        raise AuthorityError(f"check {check_id} requires unauthorized live effects")
    before = source_snapshot(root)
    assert_scope(contract, state["baseline"], before)
    result = run(root, location["run"], check)
    after = source_snapshot(root)
    scope_error: EvidenceError | None = None
    try:
        assert_scope(contract, state["baseline"], after)
    except EvidenceError as exc:
        result["passed"] = False
        scope_error = exc
    receipt = {
        "receiptVersion": "1.0.0",
        "workflowId": contract["id"],
        "workflowHash": workflow_hash(contract),
        "checkId": check["id"],
        "checkDefinitionHash": check_hash(check),
        "sourceDigest": after["digest"],
        "command": check["command"],
        "exitCode": result["exitCode"],
        "discoveredTests": result["discoveredTests"],
        "stdoutSha256": result["stdoutSha256"],
        "stderrSha256": result["stderrSha256"],
        "stdoutTruncated": result["stdoutTruncated"],
        "stderrTruncated": result["stderrTruncated"],
        "timedOut": result["timedOut"],
        "passed": result["passed"],
        "recordedAt": now(),
    }
    write_json(location["receipts"] / f"{check_id}.json", receipt)
    sys.stdout.write(result["stdout"])
    sys.stderr.write(result["stderr"])
    tests = "unparsed" if result["discoveredTests"] is None else str(result["discoveredTests"])
    outcome = "PASS" if result["passed"] else "FAIL"
    print(f"AMANAR_CHECK {check_id} {outcome} tests={tests}")
    if scope_error is not None:
        raise scope_error
    if not result["passed"]:
        detail = "timed out" if result["timedOut"] else "failed acceptance"
        raise CheckError(f"check {check_id} {detail}")


def evidence_problems(
    root: Path, contract: dict[str, Any], location: dict[str, Path], state: dict[str, Any],
) -> list[str]:
    current = source_snapshot(root)
    problems: list[str] = []
    try:
        assert_scope(contract, state["baseline"], current)
        assert_artifacts(root, contract)
    except EvidenceError as exc:
        problems.append(str(exc))
    for check in contract["checks"]:
        receipt_path = location["receipts"] / f"{check['id']}.json"
        if not receipt_path.is_file():
            problems.append(f"missing receipt: {check['id']}")
            continue
        receipt = read_json(receipt_path)
        problem = receipt_problem(receipt, contract, check, current["digest"])
        if problem is None:
            problem = output_problem(receipt, check, location["run"] / "output")
        if problem:
            problems.append(problem)
    return problems


def cmd_verify(root: Path) -> None:
    contract, location, state = context(root)
    state = require(state, "implementing")
    problems = evidence_problems(root, contract, location, state)
    if problems:
        raise EvidenceError("; ".join(problems))
    state.update({"status": "verified", "verifiedAt": now(), "updatedAt": now()})
    write(location["state"], state)
    print(f"AMANAR_VERIFIED id={contract['id']}")


def cmd_status(root: Path) -> None:
    contract = load(paths(root)["contract"])
    location = paths(root)
    state = read_state(location["state"])
    record: dict[str, Any] = {
        "schemaVersion": contract["schemaVersion"],
        "workflowId": contract["id"],
        "status": "planned" if state is None else state["status"],
        "recordedStatus": None if state is None else state["status"],
        "current": state is None,
        "problems": [],
    }
    if state is not None:
        if state.get("workflowId") != contract["id"] or state.get("workflowHash") != workflow_hash(contract):
            record["current"] = False
            record["problems"] = ["workflow contract changed after begin"]
        else:
            problems = evidence_problems(root, contract, location, state)
            record["problems"] = problems
            record["current"] = not problems
            if state["status"] == "verified" and problems:
                record["status"] = "implementing"
    print(json.dumps(record, sort_keys=True))


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="amanar-workflow")
    result.add_argument("--version", action="version", version=__version__)
    commands = result.add_subparsers(dest="command", required=True)
    commands.add_parser("validate")
    commands.add_parser("begin")
    run_check = commands.add_parser("run-check")
    run_check.add_argument("id")
    block = commands.add_parser("block")
    block.add_argument("--reason", required=True)
    status = commands.add_parser("status")
    status.add_argument("--json", action="store_true", required=True)
    commands.add_parser("verify")
    return result


def main(argv: list[str] | None = None) -> None:
    args = parser().parse_args(argv)
    root = Path.cwd().resolve()
    try:
        if args.command == "validate":
            cmd_validate(root)
        elif args.command == "begin":
            cmd_begin(root)
        elif args.command == "run-check":
            cmd_run_check(root, args.id)
        elif args.command == "block":
            cmd_block(root, args.reason)
        elif args.command == "verify":
            cmd_verify(root)
        elif args.command == "status":
            cmd_status(root)
    except WorkflowError as exc:
        print(f"AMANAR_ERROR {exc}", file=sys.stderr)
        raise SystemExit(exc.exit_code) from exc


if __name__ == "__main__":
    main()
