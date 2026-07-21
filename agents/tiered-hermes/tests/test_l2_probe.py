import importlib.util
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tiered_hermes.l2_probe import preflight


def test_preflight_reports_missing_optional_dependencies(monkeypatch):
    monkeypatch.setattr(importlib.util, "find_spec", lambda name: None)

    result = preflight()

    assert result == {
        "ok": False,
        "status": "dependency_missing",
        "missing": ["hindsight_embed", "hindsight_client"],
    }
