"""Non-invasive preflight diagnostics for the optional Hindsight L2 tier."""
from __future__ import annotations

import importlib.util
from typing import Any

_OPTIONAL_DEPENDENCIES = ("hindsight_embed", "hindsight_client")


def preflight() -> dict[str, Any]:
    """Return dependency readiness without starting a daemon or reading secrets."""
    missing = [name for name in _OPTIONAL_DEPENDENCIES if importlib.util.find_spec(name) is None]
    if missing:
        return {"ok": False, "status": "dependency_missing", "missing": missing}
    return {"ok": True, "status": "ready", "missing": []}
