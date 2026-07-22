#!/usr/bin/env python3
"""Validate portable component boundaries and optional dependency names."""
from pathlib import Path
import tomllib

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    storage = ROOT / "storage" / "synology-mcp"
    for path in storage.rglob("*"):
        if path.is_file() and path.suffix not in {".pyc", ".pyo"} and "__pycache__" not in path.parts and "NASRID" in path.read_text(errors="replace"):
            raise SystemExit(f"estate-specific identifier found: {path}")
    optional = tomllib.loads((ROOT / "agents/tiered-hermes/pyproject.toml").read_text())["project"]["optional-dependencies"]
    for name, packages in optional.items():
        if not packages or any(not package.strip() for package in packages):
            raise SystemExit(f"empty optional dependency in {name}")
        if any(package.startswith(("hindsight-memory", "nvk-llm-wiki")) for package in packages):
            raise SystemExit(f"removed package in {name}")
    print("PASS: component boundaries and optional dependencies valid")


if __name__ == "__main__":
    main()
