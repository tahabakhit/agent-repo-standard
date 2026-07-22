from unittest.mock import MagicMock, patch

from tiered_hermes.adapters.hindsight_l2 import HindsightL2Adapter


def test_local_daemon_uses_configured_port():
    adapter = HindsightL2Adapter({"api_url": "http://127.0.0.1:9777"})
    manager = MagicMock()
    manager.is_running.return_value = False
    manager._start_daemon.return_value = True
    module = MagicMock(DaemonEmbedManager=MagicMock(return_value=manager))
    with patch.dict("sys.modules", {"hindsight_embed.daemon_embed_manager": module}):
        adapter._start_local_daemon()
    assert manager._start_daemon.call_args.kwargs["config"]["port"] == 9777
