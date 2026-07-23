#!/usr/bin/env python3
"""Validate portable component boundaries."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    storage = ROOT / "storage" / "synology-mcp"
    for path in storage.rglob("*"):
        if path.is_file() and path.suffix not in {".pyc", ".pyo"} and "__pycache__" not in path.parts and "NASRID" in path.read_text(errors="replace"):
            raise SystemExit(f"estate-specific identifier found: {path}")
    print("PASS: component boundaries valid")


if __name__ == "__main__":
    main()
