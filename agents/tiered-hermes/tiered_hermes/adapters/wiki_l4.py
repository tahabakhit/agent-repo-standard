"""LLM Wiki L4 adapter for the tiered memory provider.

Reads from a configured nvk/llm-wiki-compatible hub for canonical source-of-truth
information. Read-only in the MVP — no automated writes to wiki.

Wiki structure (nvk/llm-wiki topic hub):
    /path/to/knowledge/
      _index.md          # Topic index
      wikis.json         # Topic registry
      topics/<topic>/
        _index.md         # Topic content
        wiki/             # Curated markdown files
        raw/              # Source documents

Search uses ripgrep/FTS across the wiki directory.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from tiered_hermes.adapters.base import TierAdapter

logger = logging.getLogger(__name__)

_DEFAULT_WIKI_PATH = os.path.expanduser("~/knowledge")


class WikiL4Adapter(TierAdapter):
    """L4 canonical source of truth via LLM Wiki."""

    name = "wiki"
    priority = 4

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self._config = config or {}
        self._wiki_path = Path(self._configured_wiki_path()).expanduser()
        self._initialized = False

    def _configured_wiki_path(self) -> str:
        return self._config.get(
            "wiki_path", os.environ.get("LLM_WIKI_PATH", _DEFAULT_WIKI_PATH)
        )

    def is_available(self) -> bool:
        """Check if the wiki directory exists."""
        return self._wiki_path.is_dir()

    def initialize(self, session_id: str, **kwargs) -> None:
        self._wiki_path = Path(self._configured_wiki_path()).expanduser()
        self._initialized = True
        logger.info("Wiki L4 initialized: path=%s", self._wiki_path)

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        """Search the wiki for canonical information."""
        if not self._initialized or not self._wiki_path.is_dir():
            return ""

        try:
            # Use ripgrep for fast search across wiki topics
            # Split multi-word queries into alternation for better recall
            terms = '|'.join(query.split())
            result = subprocess.run(
                ["rg", "-i", "-l", terms,
                 str(self._wiki_path / "topics")],
                capture_output=True, text=True, timeout=5,
            )
            matches = [l.strip() for l in result.stdout.strip().split("\n") if l.strip()]

            if not matches:
                # Fall back to _index.md content
                result = subprocess.run(
                    ["rg", "-i", terms,
                     str(self._wiki_path / "_index.md")],
                    capture_output=True, text=True, timeout=5,
                )
                if result.stdout.strip():
                    return f"## Canonical Wiki (L4)\n{result.stdout.strip()[:500]}"
                return ""

            # Read first matching topic's _index.md
            lines = ["## Canonical Wiki (L4)"]
            for match_file in matches[:3]:
                try:
                    with open(match_file) as f:
                        content = f.read()[:500]
                    rel = Path(match_file).relative_to(self._wiki_path)
                    lines.append(f"  [{rel}]\n    {content}")
                except Exception:
                    pass
                if len(lines) > 10:
                    break

            return "\n".join(lines) if len(lines) > 1 else ""

        except FileNotFoundError:
            # ripgrep not installed — try Python glob fallback
            logger.debug("ripgrep not found, trying glob fallback")
            try:
                import glob as _glob
                pattern = f"{self._wiki_path}/topics/*/_index.md"
                for idx_file in sorted(_glob.glob(pattern)):
                    try:
                        with open(idx_file) as f:
                            if query.lower() in f.read().lower():
                                return f"## Canonical Wiki (L4)\n  [{idx_file}]\n    (match found)"
                    except Exception:
                        pass
            except Exception:
                pass
        except Exception as exc:
            logger.debug("Wiki L4 prefetch failed: %s", exc)

        return ""

    def get_tools(self) -> List[Dict[str, Any]]:
        return []

    def handle_tool(self, tool_name: str, args: Dict[str, Any]) -> str:
        query = args.get("query", "")
        result = self.prefetch(query)
        return json.dumps({
            "status": "ok" if result else "no_results",
            "query": query,
            "content": result,
        })

    def shutdown(self) -> None:
        self._initialized = False
