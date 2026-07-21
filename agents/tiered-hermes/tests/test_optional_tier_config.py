"""Contract tests for optional tier configuration without live services."""

from pathlib import Path


def test_l2_cloud_availability_uses_configured_api_key_env(monkeypatch):
    from tiered_hermes.adapters.hindsight_l2 import HindsightL2Adapter

    monkeypatch.setenv("TIERED_TEST_L2_KEY", "available")
    adapter = HindsightL2Adapter(config={
        "mode": "cloud",
        "api_key_env": "TIERED_TEST_L2_KEY",
    })

    assert adapter.is_available() is True


def test_l3_availability_uses_configured_server_url(monkeypatch):
    from tiered_hermes.adapters.mcp_l3 import MCPL3Adapter

    observed_urls = []

    def fake_urlopen(request, timeout):
        observed_urls.append(request.full_url)
        return object()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    adapter = MCPL3Adapter(config={"server_url": "http://configured-l3:8900"})

    assert adapter.is_available() is True
    assert observed_urls == ["http://configured-l3:8900/health"]


def test_l4_initializes_at_configured_wiki_path(tmp_path):
    from tiered_hermes.adapters.wiki_l4 import WikiL4Adapter

    wiki_path = tmp_path / "wiki"
    (wiki_path / "topics").mkdir(parents=True)
    adapter = WikiL4Adapter(config={"wiki_path": str(wiki_path)})

    assert adapter.is_available() is True
    adapter.initialize("config-test")
    assert adapter._wiki_path == Path(wiki_path)


def test_provider_passes_l4_config_before_availability_check(tmp_path, monkeypatch):
    import yaml

    from tiered_hermes import TieredMemoryProvider
    from tiered_hermes.adapters.mnemosyne_l1 import MnemosyneL1Adapter
    from tiered_hermes.adapters.mcp_l3 import MCPL3Adapter
    from tiered_hermes.adapters.wiki_l4 import WikiL4Adapter

    configured_wiki = tmp_path / "configured-wiki"
    configured_wiki.mkdir()
    (tmp_path / "config.yaml").write_text(yaml.safe_dump({
        "memory": {"tiered": {"l4": {"config": {
            "wiki_path": str(configured_wiki),
        }}}},
    }), encoding="utf-8")

    observed_config = []

    class RecordingWiki(WikiL4Adapter):
        def __init__(self, config):
            observed_config.append(config)
            super().__init__(config=config)

    monkeypatch.setattr(MnemosyneL1Adapter, "is_available", lambda _self: False)
    monkeypatch.setattr(MCPL3Adapter, "is_available", lambda _self: False)
    monkeypatch.setattr("tiered_hermes.adapters.wiki_l4.WikiL4Adapter", RecordingWiki)

    provider = TieredMemoryProvider()
    provider.initialize("config-test", hermes_home=str(tmp_path))

    assert observed_config == [{"wiki_path": str(configured_wiki)}]
    provider.shutdown()
