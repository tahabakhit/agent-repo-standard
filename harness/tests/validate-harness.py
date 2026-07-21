#!/usr/bin/env python3
"""Dependency-free structure validation for the Asturlab harness."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
SKILL = ROOT / "skills" / "asturlab-scaffold"
FIXTURE = ROOT / "tests" / "fixtures" / "scaffold-evaluations.json"


def require(value: bool, message: str) -> None:
    if not value:
        raise SystemExit(message)


def main() -> None:
    skill = (SKILL / "SKILL.md").read_text()
    require(re.search(r"^name:\s*asturlab-scaffold$", skill, re.M) is not None, "invalid scaffold name")
    require("$asturlab-scaffold" in skill, "canonical invocation missing")
    metadata = (SKILL / "agents" / "openai.yaml").read_text()
    require("allow_implicit_invocation: false" in metadata, "scaffold must be explicit-only")
    for path in SKILL.rglob("*.md"):
        text = path.read_text()
        for target in re.findall(r"\[[^]]+\]\(([^)]+)\)", text):
            if target.startswith(("http://", "https://", "#")):
                continue
            require((path.parent / target.split("#", 1)[0]).resolve().exists(), f"broken link: {path}: {target}")

    data = json.loads(FIXTURE.read_text())
    require(data.get("schema_version") == 1, "unsupported fixture schema")
    cases = data.get("cases")
    require(isinstance(cases, list) and len(cases) == 5, "expected five behavioral cases")
    ids = {item.get("id") for item in cases}
    require(len(ids) == len(cases), "fixture IDs must be unique")
    for obsolete in ("copier.yml", "template", "bin/new-repo.sh", "tests/verify-template.sh"):
        require(not (REPO / obsolete).exists(), f"obsolete live Copier path: {obsolete}")
    print("PASS: Asturlab harness structure, links, fixtures, and compatibility boundary valid")


if __name__ == "__main__":
    main()
