"""Pure loading and validation for workflow schema 1.0.0."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path, PurePosixPath
from typing import Any

from .errors import ContractError

TOP_FIELDS = {
    "schemaVersion", "id", "objective", "scope", "exclusions", "artifacts",
    "authority", "checks",
}
AUTHORITY_FIELDS = {"repositoryWrites", "liveEffects"}
CHECK_FIELDS = {
    "id", "command", "expectedExit", "outputContains", "timeoutSeconds",
    "minTests", "testParser", "liveEffect",
}
PARSERS = {"none", "unittest", "pytest", "tap"}
IDENTIFIER = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest(value: Any) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()


def _exact_fields(value: dict[str, Any], expected: set[str], label: str) -> None:
    missing = sorted(expected - set(value))
    unknown = sorted(set(value) - expected)
    if missing:
        raise ContractError(f"{label} missing fields: {', '.join(missing)}")
    if unknown:
        raise ContractError(f"{label} has unknown fields: {', '.join(unknown)}")


def _path(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        raise ContractError(f"{label} must be a non-empty normalized path")
    directory = value.endswith("/")
    raw = value[:-1] if directory else value
    path = PurePosixPath(raw)
    if path.is_absolute() or raw in {"", "."} or ".." in path.parts:
        raise ContractError(f"{label} must be repository-relative without '..'")
    if str(path) != raw or path.parts[0] == ".git":
        raise ContractError(f"{label} must be a normalized safe path")
    if path.parts[:2] == (".amanar", "run"):
        raise ContractError(f"{label} cannot include controller runtime state")
    return raw + ("/" if directory else "")


def path_in(path: str, declared: str) -> bool:
    prefix = declared[:-1] if declared.endswith("/") else declared
    return path == prefix or (declared.endswith("/") and path.startswith(prefix + "/"))


def validate(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ContractError("workflow contract must be a JSON object")
    _exact_fields(data, TOP_FIELDS, "workflow contract")
    if data["schemaVersion"] != "1.0.0":
        raise ContractError(f"unsupported schemaVersion: {data['schemaVersion']!r}")
    if not isinstance(data["id"], str) or not IDENTIFIER.fullmatch(data["id"]):
        raise ContractError("workflow id must be kebab-case")
    if not isinstance(data["objective"], str) or not data["objective"].strip():
        raise ContractError("objective must be a non-empty string")

    normalized: dict[str, list[str]] = {}
    for field in ("scope", "exclusions", "artifacts"):
        values = data[field]
        if not isinstance(values, list) or (field == "scope" and not values):
            raise ContractError(f"{field} must be {'a non-empty ' if field == 'scope' else 'an '}array")
        parsed = [_path(item, f"{field} item") for item in values]
        if len(parsed) != len(set(parsed)):
            raise ContractError(f"{field} contains duplicate paths")
        normalized[field] = parsed
    for artifact in normalized["artifacts"]:
        plain = artifact.rstrip("/")
        if not any(path_in(plain, item) for item in normalized["scope"]):
            raise ContractError(f"artifact is outside scope: {artifact}")
        if any(path_in(plain, item) for item in normalized["exclusions"]):
            raise ContractError(f"artifact is excluded: {artifact}")

    authority = data["authority"]
    if not isinstance(authority, dict):
        raise ContractError("authority must be an object")
    _exact_fields(authority, AUTHORITY_FIELDS, "authority")
    if any(type(authority[key]) is not bool for key in AUTHORITY_FIELDS):
        raise ContractError("authority values must be booleans")

    checks = data["checks"]
    if not isinstance(checks, list) or not checks:
        raise ContractError("checks must be a non-empty array")
    check_ids: list[str] = []
    for index, check in enumerate(checks):
        label = f"check {index}"
        if not isinstance(check, dict):
            raise ContractError(f"{label} must be an object")
        _exact_fields(check, CHECK_FIELDS, label)
        if not isinstance(check["id"], str) or not IDENTIFIER.fullmatch(check["id"]):
            raise ContractError(f"{label} id must be kebab-case")
        check_ids.append(check["id"])
        if not isinstance(check["command"], str) or not check["command"].strip():
            raise ContractError(f"check {check['id']} command must be non-empty")
        if type(check["expectedExit"]) is not int or not 0 <= check["expectedExit"] <= 255:
            raise ContractError(f"check {check['id']} expectedExit must be 0..255")
        tokens = check["outputContains"]
        if (not isinstance(tokens, list) or any(not isinstance(token, str) or not token for token in tokens)
                or len(tokens) != len(set(tokens))):
            raise ContractError(f"check {check['id']} outputContains must contain unique non-empty strings")
        timeout = check["timeoutSeconds"]
        if type(timeout) not in {int, float} or not 0 < timeout <= 3600:
            raise ContractError(f"check {check['id']} timeoutSeconds must be within 0..3600")
        if type(check["minTests"]) is not int or check["minTests"] < 0:
            raise ContractError(f"check {check['id']} minTests cannot be negative")
        if check["testParser"] not in PARSERS:
            raise ContractError(f"check {check['id']} has unsupported testParser")
        if check["minTests"] > 0 and check["testParser"] == "none":
            raise ContractError(f"check {check['id']} needs a test parser when minTests > 0")
        if type(check["liveEffect"]) is not bool:
            raise ContractError(f"check {check['id']} liveEffect must be boolean")
    if len(check_ids) != len(set(check_ids)):
        raise ContractError("checks require unique ids")
    return data


def load(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise ContractError(f"workflow contract missing: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ContractError(f"cannot read workflow contract: {exc}") from exc
    return validate(data)


def check_hash(check: dict[str, Any]) -> str:
    return digest(check)


def workflow_hash(contract: dict[str, Any]) -> str:
    return digest(contract)
