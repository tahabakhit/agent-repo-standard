"""Source snapshots and receipt freshness checks."""
from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any

from .contract import check_hash, path_in, workflow_hash
from .errors import EvidenceError, WorkflowError
from .execution import MAX_OUTPUT, parse_tests

RUNTIME_PREFIX = ".amanar/run/"


def _git(root: Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", *args], cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        message = result.stderr.decode("utf-8", errors="replace").strip()
        raise WorkflowError(f"Git source inspection failed: {message}")
    return result.stdout


def _file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    if path.is_symlink():
        digest.update(b"symlink\0")
        digest.update(os.readlink(path).encode("utf-8", errors="surrogateescape"))
        return digest.hexdigest()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _entry_digest(path: Path) -> str:
    details = path.lstat()
    if stat.S_ISDIR(details.st_mode):
        return "directory"
    if stat.S_ISREG(details.st_mode) or stat.S_ISLNK(details.st_mode):
        return _file_digest(path)
    return f"special:{stat.S_IFMT(details.st_mode):o}"


def _filesystem_entries(root: Path) -> dict[str, str]:
    files: dict[str, str] = {}

    def visit(directory: Path, prefix: str = "") -> None:
        try:
            entries = sorted(os.scandir(directory), key=lambda item: item.name)
        except OSError as exc:
            raise WorkflowError(f"filesystem source inspection failed: {exc}") from exc
        for entry in entries:
            name = f"{prefix}/{entry.name}" if prefix else entry.name
            if name == ".git" or name.startswith(".git/"):
                continue
            if name == ".amanar/run" or name.startswith(RUNTIME_PREFIX):
                continue
            path = Path(entry.path)
            if entry.is_dir(follow_symlinks=False):
                visit(path, name)
            else:
                files[name] = _entry_digest(path)

    visit(root)
    return files


def source_snapshot(root: Path) -> dict[str, Any]:
    head = _git(root, "rev-parse", "HEAD").decode().strip()
    names = _git(root, "ls-files", "-z", "--cached")
    files = _filesystem_entries(root)
    for raw in names.split(b"\0"):
        if not raw:
            continue
        name = raw.decode("utf-8", errors="surrogateescape")
        if name == ".amanar/run" or name.startswith(RUNTIME_PREFIX):
            continue
        if name not in files:
            files[name] = "missing"
    payload = {"head": head, "files": files}
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    payload["digest"] = hashlib.sha256(encoded).hexdigest()
    return payload


def changed_paths(baseline: dict[str, Any], current: dict[str, Any]) -> list[str]:
    before = baseline["files"]
    after = current["files"]
    return sorted(path for path in set(before) | set(after) if before.get(path) != after.get(path))


def assert_scope(contract: dict[str, Any], baseline: dict[str, Any], current: dict[str, Any]) -> None:
    if baseline["head"] != current["head"]:
        raise EvidenceError("source HEAD changed since begin")
    for path in changed_paths(baseline, current):
        if any(path_in(path, item) for item in contract["exclusions"]):
            raise EvidenceError(f"excluded path changed: {path}")
        if not any(path_in(path, item) for item in contract["scope"]):
            raise EvidenceError(f"out-of-scope path changed: {path}")


def assert_artifacts(root: Path, contract: dict[str, Any]) -> None:
    missing = [path for path in contract["artifacts"] if not (root / path.rstrip("/")).exists()]
    if missing:
        raise EvidenceError(f"declared artifacts missing: {', '.join(missing)}")


def receipt_problem(
    receipt: dict[str, Any], contract: dict[str, Any], check: dict[str, Any], source_digest: str,
) -> str | None:
    required = {
        "receiptVersion", "workflowId", "workflowHash", "checkId", "checkDefinitionHash",
        "sourceDigest", "command", "exitCode", "discoveredTests", "stdoutSha256",
        "stderrSha256", "stdoutTruncated", "stderrTruncated", "timedOut", "passed",
        "recordedAt",
    }
    if set(receipt) != required:
        return f"{check['id']} receipt fields are invalid"
    if receipt.get("receiptVersion") != "1.0.0" or receipt.get("workflowId") != contract["id"]:
        return f"{check['id']} receipt identity is invalid"
    if any(not re.fullmatch(r"[0-9a-f]{64}", str(receipt.get(field, "")))
           for field in ("workflowHash", "checkDefinitionHash", "sourceDigest", "stdoutSha256", "stderrSha256")):
        return f"{check['id']} receipt digest is invalid"
    if type(receipt.get("discoveredTests")) not in {int, type(None)}:
        return f"{check['id']} receipt test count is invalid"
    if any(type(receipt.get(field)) is not bool for field in
           ("stdoutTruncated", "stderrTruncated", "timedOut", "passed")):
        return f"{check['id']} receipt boolean is invalid"
    try:
        datetime.fromisoformat(receipt["recordedAt"])
    except (TypeError, ValueError):
        return f"{check['id']} receipt timestamp is invalid"
    expected = {
        "workflowHash": workflow_hash(contract),
        "checkDefinitionHash": check_hash(check),
        "checkId": check["id"],
        "command": check["command"],
        "sourceDigest": source_digest,
    }
    for key, value in expected.items():
        if receipt.get(key) != value:
            return f"{check['id']} receipt has stale {key}"
    if receipt.get("passed") is not True:
        return f"{check['id']} receipt did not pass"
    if receipt.get("exitCode") != check["expectedExit"]:
        return f"{check['id']} receipt exit code is stale"
    discovered = receipt.get("discoveredTests")
    if discovered is None or discovered < check["minTests"]:
        return f"{check['id']} receipt test count is insufficient"
    return None


def output_problem(receipt: dict[str, Any], check: dict[str, Any], output_dir: Path) -> str | None:
    streams: dict[str, bytes] = {}
    for stream in ("stdout", "stderr"):
        path = output_dir / f"{check['id']}.{stream}"
        try:
            details = path.lstat()
            if not stat.S_ISREG(details.st_mode) or details.st_size > MAX_OUTPUT:
                raise OSError("not a bounded regular file")
            streams[stream] = path.read_bytes()
        except OSError:
            return f"{check['id']} stored output is missing or invalid"
        actual = hashlib.sha256(streams[stream]).hexdigest()
        if receipt.get(f"{stream}Sha256") != actual:
            return f"{check['id']} {stream} digest does not match stored output"
    combined = streams["stdout"].decode("utf-8", errors="replace") + "\n" + streams["stderr"].decode(
        "utf-8", errors="replace",
    )
    discovered = parse_tests(check["testParser"], combined)
    if discovered != receipt.get("discoveredTests"):
        return f"{check['id']} stored output test count does not match receipt"
    if not all(token in combined for token in check["outputContains"]):
        return f"{check['id']} stored output lacks required tokens"
    passed = (
        receipt.get("timedOut") is False
        and receipt.get("exitCode") == check["expectedExit"]
        and discovered is not None
        and discovered >= check["minTests"]
    )
    if receipt.get("passed") is not passed:
        return f"{check['id']} receipt outcome does not match stored output"
    return None
