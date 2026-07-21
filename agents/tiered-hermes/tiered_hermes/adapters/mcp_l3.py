"""MCP bridge L3 adapter for the tiered memory provider.

Connects to a Mnemosyne MCP server for cross-agent memory sharing.
Uses MCP client protocol (stdio transport) to communicate with a
locally-running Mnemosyne MCP process.

Design constraints from spec:
- Candidate-only writes (never trust MCP content as canonical)
- Loopback binding by default
- Token-gated for non-loopback (MNEMOSYNE_MCP_TOKEN)
- Used only when depth='shared' or explicit cross-agent queries

Start the Mnemosyne MCP server before using this adapter:
    mnemosyne mcp --host 127.0.0.1 --port 8900
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

from tiered_hermes.adapters.base import TierAdapter

logger = logging.getLogger(__name__)

_DEFAULT_MCP_URL = "http://127.0.0.1:8900"


class MCPL3Adapter(TierAdapter):
    """L3 cross-agent memory via MCP bridge."""

    name = "mcp"
    priority = 3

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self._config = config or {}
        self._server_url = self._config.get(
            "server_url", os.environ.get("MNEMOSYNE_MCP_URL", _DEFAULT_MCP_URL)
        )
        self._token_env = self._config.get("token_env", "MNEMOSYNE_MCP_TOKEN")
        self._token = os.environ.get(self._token_env, "")
        self._initialized = False

    def is_available(self) -> bool:
        """Check if MCP server is configured and reachable."""
        url = self._server_url
        # Quick check: is something listening?
        try:
            import urllib.request
            req = urllib.request.Request(f"{url}/health", method="GET")
            urllib.request.urlopen(req, timeout=2)
            return True
        except Exception:
            return False

    def initialize(self, session_id: str, **kwargs) -> None:
        self._token = os.environ.get(self._token_env, "")
        self._initialized = True
        logger.info("MCP L3 initialized: server=%s", self._server_url)

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        """Query remote Mnemosyne MCP server for shared memories."""
        if not self._initialized:
            return ""
        try:
            import urllib.request
            payload = json.dumps({"query": query, "limit": 5}).encode()
            headers = {"Content-Type": "application/json"}
            if self._token:
                headers["Authorization"] = f"Bearer {self._token}"
            req = urllib.request.Request(
                f"{self._server_url}/recall",
                data=payload, headers=headers, method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            results = data.get("results", [])
            if results:
                lines = ["## Shared Memory (L3 MCP)"]
                for r in results[:5]:
                    content = r.get("content", "")
                    lines.append(f"  [MCP] {content[:200]}")
                return "\n".join(lines)
        except Exception as exc:
            logger.debug("MCP L3 prefetch failed: %s", exc)
        return ""

    def sync_write(self, user_content: str, assistant_content: str, *, session_id: str = "") -> None:
        """Write to remote MCP server (candidate-only, never canonical)."""
        # Candidate-only: we never write user conversation to shared MCP
        # unless explicitly requested via tiered_promote with shared=True.
        pass

    def get_tools(self) -> List[Dict[str, Any]]:
        return []

    def handle_tool(self, tool_name: str, args: Dict[str, Any]) -> str:
        return json.dumps({
            "status": "ok",
            "tool": tool_name,
            "note": "MCP L3 does not expose tools directly. Use tiered_recall with depth='shared'.",
        })

    def shutdown(self) -> None:
        self._initialized = False
