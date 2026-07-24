#!/usr/bin/env python3
"""Validate portable component boundaries."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


SKIP_DIRS = {".git", "node_modules", ".venv", "dist", "__pycache__"}
# Estate-specific identifiers that must never appear in the portable, public kit.
ESTATE_IDENTIFIERS = ("NASRID",)
SELF = Path(__file__).resolve()


def main() -> None:
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if path.resolve() == SELF:  # don't scan this file, which names the identifiers
            continue
        if any(part in SKIP_DIRS for part in path.relative_to(ROOT).parts):
            continue
        if path.suffix in {".pyc", ".pyo"}:
            continue
        text = path.read_text(errors="replace")
        for identifier in ESTATE_IDENTIFIERS:
            if identifier in text:
                raise SystemExit(f"estate-specific identifier {identifier!r} found: {path.relative_to(ROOT)}")
    print("PASS: component boundaries valid")


if __name__ == "__main__":
    main()
