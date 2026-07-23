"""Deterministic workflow state persistence."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .errors import IncompleteError, WorkflowError


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise WorkflowError(f"cannot read controller state: {exc}") from exc
    if not isinstance(value, dict) or value.get("status") not in {"planned", "implementing", "blocked", "verified"}:
        raise WorkflowError("controller state is invalid")
    return value


def write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def require(state: dict[str, Any] | None, *statuses: str) -> dict[str, Any]:
    actual = "planned" if state is None else state["status"]
    if actual not in statuses:
        raise IncompleteError(f"invalid state: expected {' or '.join(statuses)}, found {actual}")
    return state or {"status": "planned"}
