"""Unified tool schemas for the tiered memory provider.

All tools are prefixed 'tiered_' to avoid shadowing Hermes core tools.
The tiered provider exposes 6 tools (vs. Mnemosyne's 37+) to keep the
model tool surface compact and intent-driven.
"""

TIERED_REMEMBER = {
    "name": "tiered_remember",
    "description": (
        "Store a memory in L1. Use for any fact, preference, decision, "
        "identity, or context that should persist in the active memory system. "
        "When durable=true, also attempts L2 promotion if L2 is available and "
        "reports durable=false with a reason when it is not."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "content": {"type": "string", "description": "The memory content to store."},
            "kind": {
                "type": "string",
                "enum": ["fact", "preference", "decision", "insight", "identity", "task"],
                "description": "Kind of memory. Default 'fact'.",
                "default": "fact",
            },
            "importance": {
                "type": "number",
                "description": "Importance 0.0-1.0. Higher = surfaced more often. Default 0.5.",
                "default": 0.5,
            },
            "durable": {
                "type": "boolean",
                "description": "If true, attempt durable L2 promotion when L2 is available.",
                "default": False,
            },
            "scope": {
                "type": "string",
                "enum": ["session", "global"],
                "description": "'session' (default) scopes to current session; 'global' persists across sessions.",
                "default": "session",
            },
        },
        "required": ["content"],
    },
}

TIERED_RECALL = {
    "name": "tiered_recall",
    "description": (
        "Search memory across tiers. L1 (hot) is always searched. "
        "L2 is searched when depth='deep' if available; L3 when depth='shared'; "
        "L4 when depth='canonical'. Unavailable requested tiers are reported."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Natural language query."},
            "limit": {
                "type": "integer",
                "description": "Max results. Default 5.",
                "default": 5,
            },
            "depth": {
                "type": "string",
                "enum": ["hot", "deep", "canonical", "shared"],
                "description": (
                    "hot = L1 only (fast, local). "
                    "deep = L1 + L2 when available. "
                    "canonical = L4 wiki (source of truth). "
                    "shared = L3 MCP (cross-agent). "
                    "Default 'hot'."
                ),
                "default": "hot",
            },
        },
        "required": ["query"],
    },
}

TIERED_FORGET = {
    "name": "tiered_forget",
    "description": "Delete a memory by ID. Searches L1 then L2.",
    "parameters": {
        "type": "object",
        "properties": {
            "memory_id": {"type": "string", "description": "Memory ID to delete."},
        },
        "required": ["memory_id"],
    },
}

TIERED_PROMOTE = {
    "name": "tiered_promote",
    "description": (
        "Promote a memory from L1 (hot) to L2 (durable). "
        "Use for facts with repeated evidence, long-term relevance, "
        "or when the user explicitly asks to remember something permanently."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "memory_id": {
                "type": "string",
                "description": "Memory ID to promote from L1 to L2.",
            },
            "reason": {
                "type": "string",
                "description": "Brief reason for promotion (e.g., 'user requested', 'repeated evidence').",
            },
        },
        "required": ["memory_id"],
    },
}

TIERED_CANONICAL = {
    "name": "tiered_canonical",
    "description": (
        "Query the canonical wiki (L4) for source-of-truth information. "
        "Use when L1/L2 recall conflicts with documented facts, or when "
        "the user asks for the definitive/authoritative answer."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query."},
        },
        "required": ["query"],
    },
}

TIERED_STATUS = {
    "name": "tiered_status",
    "description": "Show tier health, memory counts, and storage paths.",
    "parameters": {"type": "object", "properties": {}},
}

ALL_TOOLS = [
    TIERED_REMEMBER,
    TIERED_RECALL,
    TIERED_FORGET,
    TIERED_PROMOTE,
    TIERED_CANONICAL,
    TIERED_STATUS,
]
