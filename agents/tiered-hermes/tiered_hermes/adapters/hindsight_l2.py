"""Hindsight L2 adapter for the tiered memory provider.

Wraps the Hindsight client + embedded daemon for local durable memory
with knowledge graph, entity resolution, and multi-strategy retrieval.

Supports:
- local_embedded: Runs Hindsight daemon locally (default, no API key)
- local_external: Connects to existing Hindsight at HINDSIGHT_API_URL
- cloud: Connects to api.hindsight.vectorize.io (needs HINDSIGHT_API_KEY)

Requires: pip install hindsight-client==0.6.1 hindsight-embed==0.8.4
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from urllib.parse import urlparse
from pathlib import Path
from typing import Any, Dict, List, Optional

from tiered_hermes.adapters.base import TierAdapter

logger = logging.getLogger(__name__)

_DEFAULT_LOCAL_URL = "http://localhost:8888"
_DAEMON_START_TIMEOUT = 30  # seconds to wait for local daemon


class HindsightL2Adapter(TierAdapter):
    """L2 durable memory via Hindsight (local embedded)."""

    name = "hindsight"
    priority = 2

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self._config = config or {}
        self._initialized = False
        self._mode = self._config.get(
            "mode", os.environ.get("HINDSIGHT_MODE", "local_embedded")
        )
        self._api_url = self._config.get(
            "api_url", os.environ.get("HINDSIGHT_API_URL", _DEFAULT_LOCAL_URL)
        )
        self._api_key_env = self._config.get("api_key_env", "HINDSIGHT_API_KEY")
        self._daemon_started = False

    def is_available(self) -> bool:
        """Check if Hindsight can run locally."""
        mode = self._mode
        if mode in ("local_embedded", "local_external", "local"):
            # Check if daemon_embed_manager can be imported
            try:
                import hindsight_embed.daemon_embed_manager  # noqa: F401
                return True
            except ImportError:
                pass
            # Check if external daemon is reachable
            api_url = self._api_url
            try:
                import urllib.request
                req = urllib.request.Request(f"{api_url}/health", method="GET")
                urllib.request.urlopen(req, timeout=2)
                return True
            except Exception:
                pass
        if mode == "cloud":
            return bool(os.environ.get(self._api_key_env))
        return False

    def initialize(self, session_id: str, **kwargs) -> None:
        if self._mode in ("local_embedded", "local"):
            self._start_local_daemon()
        self._initialized = True
        logger.info("Hindsight L2 initialized: mode=%s url=%s", self._mode, self._api_url)

    def _start_local_daemon(self) -> None:
        """Ensure the Hindsight embedded daemon is running."""
        try:
            # The DaemonEmbedManager auto-starts the daemon when instantiated.
            # Just wait for it to become healthy.
            from hindsight_embed.daemon_embed_manager import DaemonEmbedManager
            mgr = DaemonEmbedManager()
            # Check if already running
            if mgr.is_running("hermes"):
                logger.info("Hindsight daemon already running")
                self._daemon_started = True
                return
            # Start it
            port = urlparse(self._api_url).port or 8888
            ok = mgr._start_daemon(
                config={"profile": "hermes", "host": "127.0.0.1", "port": port},
                profile="hermes",
            )
            if ok:
                logger.info("Hindsight daemon started")
                self._daemon_started = True
            else:
                logger.warning("Hindsight daemon start returned False")
        except ImportError:
            logger.debug("hindsight-embed not installed")
        except Exception as exc:
            logger.debug("Hindsight daemon start: %s", exc)

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        """Search long-term Hindsight memory."""
        if not self._initialized:
            return ""
        try:
            import urllib.request
            payload = json.dumps({
                "query": query,
                "max_results": 5,
                "recall_types": ["observation"],
            }).encode()
            headers = {
                "Content-Type": "application/json",
            }
            api_key = os.environ.get(self._api_key_env, "")
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"

            req = urllib.request.Request(
                f"{self._api_url}/recall",
                data=payload, headers=headers, method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())

            results = data.get("results", [])
            if results:
                lines = ["## Durable Memory (L2 Hindsight)"]
                for r in results[:5]:
                    content = r.get("content", r.get("text", ""))
                    score = r.get("score", r.get("relevance", 0))
                    lines.append(f"  [{score:.2f}] {content[:300]}")
                return "\n".join(lines)
        except Exception as exc:
            logger.debug("Hindsight L2 prefetch failed: %s", exc)
        return ""

    def sync_write(
        self,
        user_content: str,
        assistant_content: str,
        *,
        session_id: str = "",
    ) -> None:
        """Retain a turn to Hindsight long-term memory."""
        if not self._initialized:
            return
        try:
            import threading
            # Fire-and-forget to avoid blocking turn completion
            def _do_retain():
                try:
                    import urllib.request
                    payload = json.dumps({
                        "content": f"[USER] {user_content[:2000]}\n[ASSISTANT] {assistant_content[:2000]}",
                        "context": "hermes conversation turn",
                        "tags": ["hermes", "conversation"],
                    }).encode()
                    headers = {"Content-Type": "application/json"}
                    api_key = os.environ.get(self._api_key_env, "")
                    if api_key:
                        headers["Authorization"] = f"Bearer {api_key}"
                    req = urllib.request.Request(
                        f"{self._api_url}/retain",
                        data=payload, headers=headers, method="POST",
                    )
                    urllib.request.urlopen(req, timeout=60)
                except Exception as exc:
                    logger.debug("Hindsight retain failed: %s", exc)

            threading.Thread(target=_do_retain, daemon=True).start()
        except Exception:
            pass

    def get_tools(self) -> List[Dict[str, Any]]:
        return []

    def handle_tool(self, tool_name: str, args: Dict[str, Any]) -> str:
        return json.dumps({
            "status": "ok",
            "tool": tool_name,
            "note": "Hindsight L2 is queried automatically via tiered_recall depth='deep'",
        })

    def shutdown(self) -> None:
        self._initialized = False
