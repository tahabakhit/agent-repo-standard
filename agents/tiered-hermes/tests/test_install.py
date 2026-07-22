"""Wrapper-mode installation and Hermes discovery smoke tests."""

import os
import sys
from pathlib import Path

import pytest


def test_wrapper_install_discovers_and_loads_tiered_provider(tmp_path, monkeypatch):
    """A temporary Hermes home discovers the wrapper without touching the real one."""
    pytest.importorskip("plugins.memory")
    hermes_home = tmp_path / "hermes-home"
    hermes_home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))

    hermes_source = Path.home() / ".hermes" / "hermes-agent"
    if str(hermes_source) not in sys.path:
        sys.path.insert(0, str(hermes_source))
    from tiered_hermes.install import install_plugin

    wrapper = install_plugin(
        hermes_home_path=hermes_home,
        python=sys.executable,
    )
    wrapper_source = (wrapper / "__init__.py").read_text(encoding="utf-8")
    assert "register_memory_provider" in wrapper_source
    assert "MemoryProvider" in wrapper_source
    assert "_site.addsitedir(_SITE)" in wrapper_source
    assert wrapper.parent == hermes_home / "plugins"
    assert wrapper != os.path.expanduser("~/.hermes/plugins/tiered")

    from plugins.memory import discover_memory_providers, load_memory_provider

    discovered = {
        name: available
        for name, _description, available in discover_memory_providers()
    }
    assert discovered["tiered"] is True

    provider = load_memory_provider("tiered")
    assert provider is not None
    assert provider.name == "tiered"
    assert provider.is_available() is True
