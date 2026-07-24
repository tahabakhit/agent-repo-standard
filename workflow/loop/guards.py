"""Structural anti-gaming guards for the bounded-loop runner.

Two families of check:

1. detect_test_tampering — flags test files that were modified or deleted since
   the loop started.  Call snapshot_tests once before the first agent iteration
   to capture the baseline; pass the snapshot to detect_test_tampering after
   each agent run.

2. detect_placeholders — flags placeholder markers (raise NotImplementedError,
   TODO, FIXME, bare pass, standalone ...) found in non-test scope files.
   Operates on the current working-tree state after each agent invocation.
   Accepts an optional ``allowed_markers`` set of stable marker keys; markers
   whose key is in that set are skipped.  Default (empty set) is strict: every
   marker blocks 'verified'.

Both functions accept ``root`` (absolute repo root) and ``contract``
(dict decoded from workflow.json).  They are pure: no subprocess calls, no
side effects, no network.

Stable marker keys (used by ``allowed_markers`` and the ``--allow-marker`` CLI
flag):

  "notimplemented" — raise NotImplementedError
  "todo"           — TODO comment
  "fixme"          — FIXME comment
  "pass"           — bare pass statement
  "ellipsis"       — standalone ... expression
"""
from __future__ import annotations

import fnmatch
import hashlib
import re
from pathlib import Path
from typing import Iterator

# ---------------------------------------------------------------------------
# Test-file identification
# ---------------------------------------------------------------------------

# Filename globs that mark a file as a test file
_TEST_NAME_PATTERNS = ("test_*.py", "*_test.py", "*.test.*")


def _is_test_file(rel: Path) -> bool:
    """Return True when *rel* matches a test-file naming convention.

    Matches on filename glob patterns or on membership inside a directory
    named ``tests``.
    """
    name = rel.name
    for pat in _TEST_NAME_PATTERNS:
        if fnmatch.fnmatch(name, pat):
            return True
    # any file whose path includes a component named 'tests'
    return "tests" in rel.parts


# ---------------------------------------------------------------------------
# Scope iteration
# ---------------------------------------------------------------------------


def _iter_scope_files(root: Path, contract: dict) -> Iterator[Path]:
    """Yield every regular file that falls inside the contract scope.

    Scope entries may be relative file paths or relative directory paths;
    non-existent entries are silently skipped.
    """
    for entry in contract.get("scope", []):
        target = root / entry
        if not target.exists():
            continue
        if target.is_dir():
            for p in target.rglob("*"):
                if p.is_file():
                    yield p
        elif target.is_file():
            yield target


# ---------------------------------------------------------------------------
# SHA-256 helper
# ---------------------------------------------------------------------------


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Guard 1: test-file tampering
# ---------------------------------------------------------------------------


def snapshot_tests(root: Path, contract: dict) -> dict[str, str]:
    """Capture ``{rel_path: sha256}`` for every test file in the contract scope.

    Call this once **before** the first agent iteration.  Pass the returned
    dict to :func:`detect_test_tampering` after each agent run.
    """
    result: dict[str, str] = {}
    for path in _iter_scope_files(root, contract):
        rel = path.relative_to(root)
        if _is_test_file(rel):
            result[str(rel)] = _sha256(path)
    return result


def detect_test_tampering(
    root: Path,
    contract: dict,
    baseline: dict[str, str],
) -> list[str]:
    """Return relative paths of test files that were modified or deleted.

    Compares the current working tree against *baseline* (the dict returned by
    :func:`snapshot_tests`).  A path is flagged when its SHA-256 changed or
    the file no longer exists.  The *contract* parameter is accepted for API
    symmetry but is not used during comparison (the baseline already encodes
    which files were in scope).
    """
    offenders: list[str] = []
    for rel_str, original_hash in baseline.items():
        current = root / rel_str
        if not current.exists():
            offenders.append(rel_str)
        elif _sha256(current) != original_hash:
            offenders.append(rel_str)
    return sorted(offenders)


# ---------------------------------------------------------------------------
# Guard 2: placeholder code
# ---------------------------------------------------------------------------

_RAISE_NOT_IMPL_RE = re.compile(r"\braise\s+NotImplementedError\b")
_TODO_RE = re.compile(r"\bTODO\b")
_FIXME_RE = re.compile(r"\bFIXME\b")
# bare pass: the stripped line is exactly 'pass' or 'pass # ...'
_BARE_PASS_RE = re.compile(r"^pass(\s+#.*)?$")
# standalone ellipsis: the stripped line is exactly '...' or '... # ...'
_ELLIPSIS_RE = re.compile(r"^\.\.\.\s*(#.*)?$")

# Canonical set of stable marker keys accepted by detect_placeholders and the
# --allow-marker CLI flag.
MARKER_KEYS: frozenset[str] = frozenset(
    {"notimplemented", "todo", "fixme", "pass", "ellipsis"}
)


def _first_placeholder(text: str, allowed_markers: set[str] = set()) -> str | None:  # noqa: B006
    """Return the label of the first placeholder marker found in *text*.

    Markers whose stable key appears in *allowed_markers* are skipped.
    """
    for line in text.splitlines():
        stripped = line.strip()
        if "notimplemented" not in allowed_markers and _RAISE_NOT_IMPL_RE.search(stripped):
            return "raise NotImplementedError"
        if "todo" not in allowed_markers and _TODO_RE.search(stripped):
            return "TODO"
        if "fixme" not in allowed_markers and _FIXME_RE.search(stripped):
            return "FIXME"
        if "pass" not in allowed_markers and _BARE_PASS_RE.match(stripped):
            return "pass"
        if "ellipsis" not in allowed_markers and _ELLIPSIS_RE.match(stripped):
            return "..."
    return None


def detect_placeholders(
    root: Path,
    contract: dict,
    allowed_markers: set[str] | None = None,
) -> list[tuple[str, str]]:
    """Return ``[(rel_path, marker)]`` for placeholder code in scope files.

    Scans all files inside the contract scope, excluding:
    - files that match test-file naming patterns
    - files under ``.amanar/``

    Returns at most one entry per file (the first marker encountered).

    ``allowed_markers`` is an optional set of stable marker keys (see
    :data:`MARKER_KEYS`) whose corresponding markers are *not* flagged.
    Default (``None`` or empty set) is strict: every marker blocks 'verified'.
    """
    _allowed: set[str] = allowed_markers if allowed_markers is not None else set()
    offenders: list[tuple[str, str]] = []
    amanar = root / ".amanar"
    for path in _iter_scope_files(root, contract):
        # exclude .amanar/ internals
        try:
            path.relative_to(amanar)
            continue
        except ValueError:
            pass
        rel = path.relative_to(root)
        if _is_test_file(rel):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        marker = _first_placeholder(text, _allowed)
        if marker is not None:
            offenders.append((str(rel), marker))
    return offenders
