#!/usr/bin/env python3
"""Validate canonical Amanar workflow skill contracts."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / "skills"

# Skills with live effects must stay explicit-only.
EXPLICIT_ONLY = {"amanar-workflow"}

# Skills that are model-invocable by default.
MODEL_INVOCABLE = {"amanar-inquire", "amanar-design", "amanar-assure"}

KNOWN_SKILLS = EXPLICIT_ONLY | MODEL_INVOCABLE

# Invocation tokens that may appear in skill markdown.
ALLOWED_TOKENS = KNOWN_SKILLS | {"amanar-scaffold", "agent-eval:evaluate-all"}


def _parse_frontmatter(text: str) -> str:
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 2:
            return parts[1]
    return ""


def validate_skill(root: Path) -> None:
    name = root.name
    skill_text = (root / "SKILL.md").read_text()
    frontmatter = _parse_frontmatter(skill_text)
    openai_text = (root / "agents" / "openai.yaml").read_text()

    has_disable = "disable-model-invocation: true" in frontmatter
    has_implicit_false = "allow_implicit_invocation: false" in openai_text
    has_implicit_true = "allow_implicit_invocation: true" in openai_text

    # Internal consistency: disable-model-invocation iff allow_implicit_invocation: false
    if has_disable != has_implicit_false:
        raise SystemExit(
            f"invocation policy inconsistency in {name}: "
            f"SKILL.md disable-model-invocation={has_disable} "
            f"but openai.yaml allow_implicit_invocation: false={has_implicit_false}"
        )

    if name in EXPLICIT_ONLY:
        if not has_disable:
            raise SystemExit(f"explicit-only skill missing disable-model-invocation: {name}")
        if not has_implicit_false:
            raise SystemExit(f"explicit-only skill missing allow_implicit_invocation: false: {name}")
        if re.search(r"Use only when explicitly invoked", skill_text) is None:
            raise SystemExit(f"explicit-only skill missing 'Use only when explicitly invoked' clause: {name}")
    elif name in MODEL_INVOCABLE:
        if has_disable:
            raise SystemExit(f"model-invocable skill has disable-model-invocation: {name}")
        if not has_implicit_true:
            raise SystemExit(f"model-invocable skill missing allow_implicit_invocation: true: {name}")
        if re.search(r"Use only when explicitly invoked", skill_text) is not None:
            raise SystemExit(f"model-invocable skill should not have 'Use only when explicitly invoked' clause: {name}")

    # Required frontmatter fields
    if re.search(r"^name:\s*\S+", frontmatter, re.M) is None:
        raise SystemExit(f"missing name field in frontmatter: {name}")
    if re.search(r"^description:\s*.+", frontmatter, re.M) is None:
        raise SystemExit(f"missing description field in frontmatter: {name}")

    # Token check across all markdown in this skill
    for path in root.rglob("*.md"):
        for token in re.findall(r"\$[a-z][a-z0-9:-]+", path.read_text()):
            if token[1:] not in ALLOWED_TOKENS:
                raise SystemExit(f"unresolved invocation token {token}: {path}")


def main() -> None:
    actual = {path.name for path in SKILLS.iterdir() if path.is_dir()}

    # Each present skill must have the correct name in its SKILL.md
    for name in sorted(actual):
        root = SKILLS / name
        skill_text = (root / "SKILL.md").read_text()
        if re.search(rf"^name:\s*{re.escape(name)}$", skill_text, re.M) is None:
            raise SystemExit(f"name field does not match directory: {name}")

    # Every known skill must be present
    missing = KNOWN_SKILLS - actual
    if missing:
        raise SystemExit(f"expected skills are absent: {sorted(missing)}")

    # No unknown skills are present (warn about extras but don't fail — allows
    # future additions without breaking CI before this validator is updated)
    unknown = actual - KNOWN_SKILLS
    if unknown:
        print(f"WARNING: unknown skills present (not validated by policy): {sorted(unknown)}")

    # Validate each known skill
    for name in sorted(KNOWN_SKILLS):
        root = SKILLS / name
        validate_skill(root)
        # Relative-link check
        for path in root.rglob("*.md"):
            text = path.read_text()
            for target in re.findall(r"\[[^]]+\]\(([^)]+)\)", text):
                if target.startswith(("http://", "https://", "#")):
                    continue
                if not (path.parent / target.split("#", 1)[0]).resolve().exists():
                    raise SystemExit(f"broken link: {path.relative_to(ROOT)} -> {target}")

    print(
        f"PASS: {len(KNOWN_SKILLS)} workflow skills validated "
        f"({len(MODEL_INVOCABLE)} model-invocable, {len(EXPLICIT_ONLY)} explicit-only)"
    )


if __name__ == "__main__":
    main()
