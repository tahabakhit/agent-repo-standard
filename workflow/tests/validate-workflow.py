#!/usr/bin/env python3
"""Validate canonical Asturlab workflow skill contracts."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / "skills"
EXPECTED = {
    "asturlab-workflow",
    "asturlab-inquire",
    "asturlab-design",
    "asturlab-orchestrate",
    "asturlab-assure",
}
ALLOWED_TOKENS = {f"asturlab-{name.split('asturlab-', 1)[1]}" for name in EXPECTED} | {"asturlab-scaffold", "agent-eval:evaluate-all"}


def validate_skill(root: Path) -> None:
    skill = (root / "SKILL.md").read_text()
    frontmatter = skill.split("---", 2)[1] if skill.startswith("---") else ""
    if re.search(r"^name:\s*\S+", frontmatter, re.M) is None or re.search(r"^description:\s*.+Use only when explicitly invoked", frontmatter, re.M) is None or "disable-model-invocation: true" not in frontmatter:
        raise SystemExit(f"invalid explicit skill frontmatter: {root.name}")
    metadata = (root / "agents" / "openai.yaml").read_text()
    if "allow_implicit_invocation: false" not in metadata:
        raise SystemExit(f"skill is not explicit-only: {root.name}")
    for path in root.rglob("*.md"):
        for token in re.findall(r"\$[a-z][a-z0-9:-]+", path.read_text()):
            if token[1:] not in ALLOWED_TOKENS:
                raise SystemExit(f"unresolved invocation token {token}: {path}")


def main() -> None:
    actual = {path.name for path in SKILLS.iterdir() if path.is_dir()}
    if actual != EXPECTED:
        raise SystemExit(f"workflow skill set mismatch: {sorted(actual)}")
    for name in sorted(EXPECTED):
        root = SKILLS / name
        skill = (root / "SKILL.md").read_text()
        if re.search(rf"^name:\s*{re.escape(name)}$", skill, re.M) is None:
            raise SystemExit(f"invalid skill name: {name}")
        validate_skill(root)
        for path in root.rglob("*.md"):
            text = path.read_text()
            for target in re.findall(r"\[[^]]+\]\(([^)]+)\)", text):
                if target.startswith(("http://", "https://", "#")):
                    continue
                if not (path.parent / target.split("#", 1)[0]).resolve().exists():
                    raise SystemExit(f"broken link: {path.relative_to(ROOT)} -> {target}")
    print("PASS: five canonical workflow skills and references valid")


if __name__ == "__main__":
    main()
