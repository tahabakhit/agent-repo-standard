"""Test fixtures for tiered memory provider."""

import os
import tempfile
from pathlib import Path

import pytest


@pytest.fixture
def temp_hermes_home(monkeypatch):
    """Create a temporary HERMES_HOME with minimal config."""
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp)
        (home / "plugins").mkdir()
        (home / "memories").mkdir()
        (home / "logs").mkdir()

        # Write config with tiered provider
        import yaml
        config = {
            "memory": {
                "provider": "tiered",
                "memory_enabled": True,
                "user_profile_enabled": True,
                "tiered": {
                    "l1": {
                        "config": {
                            "profile_isolation": False,
                            "sync_roles": ["user"],
                            "default_scope": "session",
                            "skip_contexts": "cron,flush,subagent,background,skill_loop",
                            "tools": "mnemosyne_remember,mnemosyne_recall,mnemosyne_get,mnemosyne_forget,mnemosyne_stats",
                        }
                    },
                },
            },
        }
        with open(home / "config.yaml", "w") as f:
            yaml.safe_dump(config, f)

        monkeypatch.setenv("HERMES_HOME", str(home))
        yield home


@pytest.fixture
def provider(temp_hermes_home):
    """Create and initialize a TieredMemoryProvider with L1 only."""
    # Add hermes-agent to path
    import sys
    hermes_agent_path = os.path.expanduser("~/.hermes/hermes-agent")
    if hermes_agent_path not in sys.path:
        sys.path.insert(0, hermes_agent_path)

    from tiered_hermes import TieredMemoryProvider
    p = TieredMemoryProvider()
    p.initialize(
        "test-session",
        hermes_home=str(temp_hermes_home),
        platform="cli",
        agent_context="primary",
        agent_identity="test",
    )
    yield p
    p.shutdown()
