#!/usr/bin/env python3
"""Link Amanar's portable skills into each coding-agent host's skill directory.

Amanar owns the skills; this is the versioned, tested superset of the ad-hoc
`~/.agents/scripts` linkers. It symlinks each `amanar-*` skill into Pi
(`~/.agents/skills`), Codex (`~/.codex/skills`), and Claude (`~/.claude/skills`),
and supersedes the pre-amanar personal entries they replace (backed up, never
deleted outright).

Opt-in developer tool: dry-run by default, `--apply` to act, `--remove` to unlink.
It writes only under each host's skill directory, never other user config, and is
never run by `make validate` or a hook. Local only — remote propagation to an estate
is operational and belongs in Anẓar, not here.

Host homes are overridable by env (`AGENTS_HOME`, `CODEX_HOME`, `CLAUDE_HOME`) for
testing and non-default installs.
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SKILL_ROOTS = [REPO / "harness" / "skills", REPO / "workflow" / "skills"]
HOSTS = {"pi": ("AGENTS_HOME", ".agents"), "codex": ("CODEX_HOME", ".codex"), "claude": ("CLAUDE_HOME", ".claude")}
# Pre-amanar personal skills superseded by an amanar-* skill.
SUPERSEDE = {"orchestrate": "amanar-orchestrate", "scaffold": "amanar-scaffold", "codebase-design": "amanar-design"}
PROTECTED = {".system"}


def discover_sources() -> dict[str, Path]:
    sources: dict[str, Path] = {}
    for base in SKILL_ROOTS:
        if not base.is_dir():
            continue
        for entry in sorted(base.iterdir()):
            if entry.is_dir() and (entry / "SKILL.md").is_file():
                sources[entry.name] = entry
    return sources


def _skills_dir(host: str) -> Path:
    var, default = HOSTS[host]
    return Path(os.environ.get(var) or Path.home() / default) / "skills"


def _is_ours(path: Path, source: Path) -> bool:
    return path.is_symlink() and os.readlink(path) == str(source)


def plan(sources: dict[str, Path], hosts: list[str], supersede: bool, remove: bool) -> list[dict]:
    actions: list[dict] = []
    for host in hosts:
        skills = _skills_dir(host)
        if not skills.parent.is_dir():
            actions.append({"op": "skip-host", "host": host, "path": str(skills.parent), "reason": "host not installed"})
            continue
        if skills.is_symlink():
            actions.append({"op": "refuse", "host": host, "path": str(skills), "reason": "skills dir is a symlink"})
            continue
        for name, source in sources.items():
            target = skills / name
            if remove:
                if _is_ours(target, source):
                    actions.append({"op": "unlink", "host": host, "path": str(target)})
                continue
            if _is_ours(target, source):
                actions.append({"op": "ok", "host": host, "path": str(target)})
            else:
                actions.append({
                    "op": "link", "host": host, "path": str(target), "source": str(source),
                    "backup": target.exists() or target.is_symlink(),
                })
        if remove or not supersede:
            continue
        for old, new in SUPERSEDE.items():
            if new not in sources or old in PROTECTED:
                continue
            old_path = skills / old
            if old_path.exists() and not _is_ours(old_path, sources[new]):
                actions.append({"op": "supersede", "host": host, "path": str(old_path)})
    return actions


def apply(actions: list[dict], stamp: str) -> None:
    for action in actions:
        path = Path(action["path"])
        if action["op"] == "link":
            if action.get("backup"):
                _backup(path, stamp)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.symlink_to(action["source"])
        elif action["op"] == "supersede":
            _backup(path, stamp)
        elif action["op"] == "unlink":
            path.unlink()


def _backup(path: Path, stamp: str) -> None:
    backup_dir = path.parent / "backups" / f"sync-skills-{stamp}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    shutil.move(str(path), str(backup_dir / path.name))


def _describe(action: dict) -> str:
    if action["op"] == "link":
        return f"link    {action['path']} -> {action['source']}" + ("  (backing up existing)" if action.get("backup") else "")
    if action["op"] == "supersede":
        return f"supersede {action['path']} (superseded by amanar-*)"
    if action["op"] == "unlink":
        return f"unlink  {action['path']}"
    if action["op"] == "ok":
        return f"ok      {action['path']}"
    return f"{action['op']:<9}{action.get('path', '')}  {action.get('reason', '')}"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="sync_skills")
    parser.add_argument("--hosts", default="pi,codex,claude")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--remove", action="store_true")
    parser.add_argument("--no-supersede", action="store_true")
    args = parser.parse_args(argv)

    actions = plan(discover_sources(), args.hosts.split(","), not args.no_supersede, args.remove)
    for action in actions:
        print(_describe(action))
    refused = any(action["op"] == "refuse" for action in actions)
    if args.apply:
        apply(actions, datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
        print("applied")
    else:
        print("dry run; re-run with --apply to act")
    raise SystemExit(1 if refused else 0)


if __name__ == "__main__":
    main()
