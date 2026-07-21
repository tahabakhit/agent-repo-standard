"""Mnemosyne L1 adapter for the tiered memory provider.

Wraps the existing standalone mnemosyne-hermes MemoryProvider as a
TierAdapter so the TieredMemoryProvider can coordinate it alongside
other tiers.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

from tiered_hermes.adapters.base import TierAdapter

logger = logging.getLogger(__name__)


class MnemosyneL1Adapter(TierAdapter):
    """L1 hot memory via mnemosyne-hermes."""

    name = "mnemosyne"
    priority = 1

    def __init__(self):
        self._provider = None  # MnemosyneMemoryProvider instance
        self._initialized = False

    def is_available(self) -> bool:
        try:
            import mnemosyne_hermes  # noqa: F401
            return True
        except ImportError:
            return False

    def initialize(self, session_id: str, **kwargs) -> None:
        if not self.is_available():
            logger.warning("Mnemosyne L1 not available, skipping init")
            return
        try:
            from mnemosyne_hermes import MnemosyneMemoryProvider
            self._provider = MnemosyneMemoryProvider()
            self._provider.initialize(session_id, **kwargs)
            self._initialized = True
            logger.info("Mnemosyne L1 initialized: session=%s", session_id)
        except Exception as exc:
            logger.warning("Mnemosyne L1 init failed: %s", exc)
            self._provider = None

    def system_prompt_block(self) -> str:
        if self._provider:
            return self._provider.system_prompt_block()
        return ""

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        if self._provider and self._initialized:
            return self._provider.prefetch(query, session_id=session_id)
        return ""

    def sync_write(
        self,
        user_content: str,
        assistant_content: str,
        *,
        session_id: str = "",
    ) -> None:
        if self._provider and self._initialized:
            self._provider.sync_turn(
                user_content, assistant_content, session_id=session_id
            )

    def get_tools(self) -> List[Dict[str, Any]]:
        """Return L1 tools scoped to the tiered provider's surface.

        The tiered provider exposes a unified 6-tool surface, so L1 tools
        are NOT forwarded directly. This method exists for internal use
        (e.g., tiered_promote needs to call mnemosyne_remember internally).
        """
        if self._provider:
            return self._provider.get_tool_schemas()
        return []

    def handle_tool(self, tool_name: str, args: Dict[str, Any]) -> str:
        """Forward a tool call to the underlying Mnemosyne provider.

        Used internally by TieredMemoryProvider for tiered_remember (L1 path),
        tiered_forget, tiered_promote, etc.
        """
        if not self._provider or not self._initialized:
            return json.dumps({
                "status": "memory_unavailable",
                "tool": tool_name,
                "reason": "Mnemosyne L1 not initialized",
                "error": "Mnemosyne unavailable: L1 not initialized",
            })
        return self._provider.handle_tool_call(tool_name, args)

    def remember(self, content: str, **kwargs) -> str:
        """Convenience: call mnemosyne_remember directly."""
        return self.handle_tool("mnemosyne_remember", {"content": content, **kwargs})

    def recall(self, query: str, limit: int = 5, **kwargs) -> str:
        """Convenience: call mnemosyne_recall directly."""
        return self.handle_tool("mnemosyne_recall", {"query": query, "limit": limit, **kwargs})

    def shutdown(self) -> None:
        if self._provider:
            self._provider.shutdown()
            self._provider = None
            self._initialized = False
