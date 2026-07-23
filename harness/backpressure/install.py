#!/usr/bin/env python3
"""Install or remove the backpressure pre-commit hook in one repository.

Per-repo and reversible: writes only `<root>/.git/hooks/pre-commit`, never global
git config. A pre-existing hook is backed up on install; `--remove` deletes the hook
only when it is exactly ours. `amanar-scaffold adopt` offers this; it is never run by
`make validate`.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

HOOK = Path(__file__).resolve().parent / "pre-commit"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="install")
    parser.add_argument("--root", default=".")
    parser.add_argument("--remove", action="store_true")
    args = parser.parse_args(argv)

    git_dir = Path(args.root).resolve() / ".git"
    if not git_dir.is_dir():
        print("install error: not a git repository", file=sys.stderr)
        raise SystemExit(1)
    hooks = git_dir / "hooks"
    hooks.mkdir(parents=True, exist_ok=True)
    dest = hooks / "pre-commit"
    ours = HOOK.read_text(encoding="utf-8")

    if args.remove:
        if dest.exists() and dest.read_text(encoding="utf-8", errors="replace") == ours:
            dest.unlink()
            print(f"removed {dest}")
        else:
            print("no amanar backpressure hook to remove")
        return

    if dest.exists() and dest.read_text(encoding="utf-8", errors="replace") != ours:
        backup = dest.with_name("pre-commit.pre-amanar")
        shutil.copy2(dest, backup)
        print(f"backed up existing hook to {backup}")
    shutil.copy2(HOOK, dest)
    dest.chmod(0o755)
    print(f"installed {dest}")


if __name__ == "__main__":
    main()
