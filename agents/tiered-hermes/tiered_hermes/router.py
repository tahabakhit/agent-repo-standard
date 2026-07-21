"""Query routing and recall ladder for the tiered memory provider.

Implements the spec's Section 7 recall ladder:
  1. Built-in Hermes memory (already in prompt)
  2. L1 Mnemosyne: always queried
  3. L2 Hindsight: deep/historical queries only
  4. L4 Wiki: canonical source-of-truth queries only
  5. L3 MCP: external/shared memory only when relevant
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from tiered_hermes.adapters.base import TierAdapter


# Signals that suggest a query needs deep/durable L2 recall
_DEEP_SIGNALS = [
    "previous", "before", "last week", "last month", "earlier", "histor",
    "project", "long-term", "across sessions", "what did we",
    "entity", "relationship", "graph", "connected to",
    "prior session", "old", "earlier conversation",
]

# Signals that suggest a query needs canonical L4 wiki lookup
_CANONICAL_SIGNALS = [
    "according to the wiki", "source of truth", "canonical",
    "what is the official", "documented", "spec says",
    "authoritative", "definitive",
]

# Signals that suggest a query needs external/shared MCP access
_SHARED_SIGNALS = [
    "shared memory", "other agent", "cross-agent",
    "team memory", "fleet", "organization",
]


def is_deep_query(query: str) -> bool:
    """Return True if the query likely needs L2 durable recall."""
    query_lower = query.lower()
    return any(signal in query_lower for signal in _DEEP_SIGNALS)


def is_canonical_query(query: str) -> bool:
    """Return True if the query likely needs L4 wiki lookup."""
    query_lower = query.lower()
    return any(signal in query_lower for signal in _CANONICAL_SIGNALS)


def is_shared_query(query: str) -> bool:
    """Return True if the query likely needs MCP cross-agent access."""
    query_lower = query.lower()
    return any(signal in query_lower for signal in _SHARED_SIGNALS)


def build_recall_context(
    query: str,
    l1: "TierAdapter | None",
    l2: "TierAdapter | None" = None,
    l3: "TierAdapter | None" = None,
    l4: "TierAdapter | None" = None,
    *,
    session_id: str = "",
    depth: str = "hot",
) -> str:
    """Execute the recall ladder and return formatted context.

    Args:
        query: The natural language query.
        l1-l4: Tier adapters (may be None if unavailable).
        session_id: Current session for scoping.
        depth: 'hot' (L1 only), 'deep' (L1+L2), 'canonical' (L4), 'shared' (L3).

    Returns:
        Formatted context string for system prompt injection, or empty string.
    """
    parts = []

    # L1: always queried
    if l1 is not None:
        l1_result = _safe_prefetch(l1, query, session_id, "L1 Mnemosyne")
        if l1_result:
            parts.append(l1_result)

    # L2: deep queries or explicit depth='deep'
    if l2 is not None and (depth == "deep" or is_deep_query(query)):
        l2_result = _safe_prefetch(l2, query, session_id, "L2 Hindsight")
        if l2_result:
            parts.append(l2_result)

    # L4: canonical queries or explicit depth='canonical'
    if l4 is not None and (depth == "canonical" or is_canonical_query(query)):
        l4_result = _safe_prefetch(l4, query, session_id, "L4 Wiki")
        if l4_result:
            parts.append(l4_result)

    # L3: shared queries or explicit depth='shared'
    if l3 is not None and (depth == "shared" or is_shared_query(query)):
        l3_result = _safe_prefetch(l3, query, session_id, "L3 MCP")
        if l3_result:
            parts.append(l3_result)

    return "\n\n".join(parts)


def _safe_prefetch(
    tier: "TierAdapter",
    query: str,
    session_id: str,
    label: str,
) -> str:
    """Call tier.prefetch safely, returning empty string on failure."""
    try:
        return tier.prefetch(query, session_id=session_id)
    except Exception:
        import logging
        logging.getLogger(__name__).debug(
            "%s prefetch failed for query: %s", label, query[:80]
        )
        return ""
