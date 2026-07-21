"""TierAdapter base class for tiered memory provider layers.

Each tier (L1 Mnemosyne, L2 Hindsight, L3 MCP bridge, L4 LLM Wiki)
implements this interface so the TieredMemoryProvider can coordinate
them uniformly.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List


class TierAdapter(ABC):
    """Standard interface for a memory tier."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Short identifier: 'mnemosyne', 'hindsight', 'mcp', 'wiki'."""

    @property
    @abstractmethod
    def priority(self) -> int:
        """1-4, lower = queried first in recall ladder."""

    def is_available(self) -> bool:
        """Return True if this tier is configured and ready."""
        return False

    def initialize(self, session_id: str, **kwargs) -> None:
        """Initialize for a session."""

    def system_prompt_block(self) -> str:
        return ""

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        return ""

    def sync_write(
        self, user_content: str, assistant_content: str,
        *, session_id: str = "",
    ) -> None:
        """Persist a completed turn."""

    def get_tools(self) -> List[Dict[str, Any]]:
        return []

    def handle_tool(self, tool_name: str, args: Dict[str, Any]) -> str:
        return '{"error": "not implemented"}'

    def shutdown(self) -> None:
        """Clean shutdown."""
