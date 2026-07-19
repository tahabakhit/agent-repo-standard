from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = ROOT / "skills" / "scaffold"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def validate_skill() -> None:
    skill_path = SKILL_ROOT / "SKILL.md"
    text = skill_path.read_text(encoding="utf-8")
    require(text.startswith("---\n"), "scaffold SKILL.md lacks YAML frontmatter")
    parts = text.split("---\n", 2)
    require(len(parts) == 3, "scaffold SKILL.md frontmatter is not closed")
    frontmatter = parts[1]
    require(re.search(r"^name:\s*scaffold\s*$", frontmatter, re.MULTILINE) is not None, "scaffold skill name is invalid")
    require(re.search(r"^description:\s*\S", frontmatter, re.MULTILINE) is not None, "scaffold skill description is missing")

    markdown_files = sorted(SKILL_ROOT.rglob("*.md"))
    require(markdown_files, "scaffold skill has no Markdown files")
    for markdown_path in markdown_files:
        markdown = markdown_path.read_text(encoding="utf-8")
        for raw_target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", markdown):
            if raw_target.startswith(("http://", "https://", "#")):
                continue
            relative_target = raw_target.split("#", 1)[0]
            target = (markdown_path.parent / relative_target).resolve()
            require(target.exists(), f"missing relative reference in {markdown_path}: {raw_target}")

    metadata = (SKILL_ROOT / "agents" / "openai.yaml").read_text(encoding="utf-8")
    require("allow_implicit_invocation: false" in metadata, "scaffold must remain explicit-only")


def validate_legacy_profile() -> None:
    legacy_paths = [
        ROOT / "copier.yml",
        ROOT / "template" / "REPO-STANDARD.md",
        ROOT / "bin" / "new-repo.sh",
        ROOT / "tests" / "verify-template.sh",
    ]
    for path in legacy_paths:
        require(path.exists(), f"legacy-fixed profile path missing: {path.relative_to(ROOT)}")

    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    require("$scaffold" in readme, "README does not identify $scaffold as the primary interface")
    require("legacy-fixed" in readme, "README does not document the legacy-fixed profile")
    require("ops/" in readme and "knowledge/" in readme, "README lacks the Atlas preservation boundary")

    for optional_root in (ROOT / "profiles", ROOT / "fragments"):
        if optional_root.exists():
            require(any(path.is_file() for path in optional_root.rglob("*")), f"empty optional structure is not allowed: {optional_root.name}")


def validate_fixture_decisions() -> None:
    fixture_path = ROOT / "tests" / "fixtures" / "scaffold-decisions.json"
    payload = json.loads(fixture_path.read_text(encoding="utf-8"))
    cases = {case["id"]: case for case in payload["cases"]}
    require(set(cases) == {"atlas-two-plane-preservation", "new-cli-minimum"}, "unexpected fixture decision set")

    atlas = cases["atlas-two-plane-preservation"]
    require(atlas["mode"] == "adopt", "Atlas fixture must exercise adoption")
    require({"ops/", "knowledge/"}.issubset(atlas["preserve"]), "Atlas fixture must preserve both authority planes")
    require(atlas["add"] == [], "Atlas fixture must not prescribe new structure")
    require("legacy-fixed tree conversion" in atlas["omit"], "Atlas fixture must reject legacy normalization")

    cli = cases["new-cli-minimum"]
    require(cli["mode"] == "new", "CLI fixture must exercise new-repository scaffolding")
    require({"README.md", "AGENTS.md", "command entrypoint", "validation entrypoint"}.issubset(cli["add"]), "CLI fixture lacks its minimum harness")
    require({"data/", "deliverables/", "artifacts/"}.issubset(cli["omit"]), "CLI fixture must omit unjustified legacy directories")


def main() -> None:
    validate_skill()
    validate_legacy_profile()
    validate_fixture_decisions()
    print("adaptive toolkit validation passed")


if __name__ == "__main__":
    main()
