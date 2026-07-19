from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = ROOT / "skills" / "scaffold"
EVALUATION_FIXTURE = ROOT / "tests" / "fixtures" / "scaffold-evaluations.json"
PIN_FILE = ROOT / "tests" / "requirements-ci.txt"


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
    require(
        re.search(r"^name:\s*scaffold\s*$", frontmatter, re.MULTILINE) is not None,
        "scaffold skill name is invalid",
    )
    require(
        re.search(r"^description:\s*\S", frontmatter, re.MULTILINE) is not None,
        "scaffold skill description is missing",
    )

    markdown_files = sorted(SKILL_ROOT.rglob("*.md"))
    require(markdown_files, "scaffold skill has no Markdown files")
    for markdown_path in markdown_files:
        markdown = markdown_path.read_text(encoding="utf-8")
        for raw_target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", markdown):
            if raw_target.startswith(("http://", "https://", "#")):
                continue
            relative_target = raw_target.split("#", 1)[0]
            target = (markdown_path.parent / relative_target).resolve()
            require(
                target.exists(),
                f"missing relative reference in {markdown_path.relative_to(ROOT)}: {raw_target}",
            )

    metadata = (SKILL_ROOT / "agents" / "openai.yaml").read_text(encoding="utf-8")
    require("allow_implicit_invocation: false" in metadata, "scaffold must remain explicit-only")


def validate_legacy_contract() -> None:
    legacy_paths = [
        ROOT / "copier.yml",
        ROOT / "template" / "REPO-STANDARD.md",
        ROOT / "template" / "bin" / "validate-repository.sh.jinja",
        ROOT / "bin" / "new-repo.sh",
        ROOT / "tests" / "verify-template.sh",
        PIN_FILE,
    ]
    for path in legacy_paths:
        require(path.exists(), f"legacy generator path missing: {path.relative_to(ROOT)}")

    pin = PIN_FILE.read_text(encoding="utf-8").strip()
    require(
        re.fullmatch(r"copier==\d+\.\d+\.\d+", pin) is not None,
        "tests/requirements-ci.txt must pin one exact Copier release",
    )

    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    migration = (ROOT / "docs" / "migrating-from-legacy-fixed.md").read_text(encoding="utf-8")
    generated_standard = (ROOT / "template" / "REPO-STANDARD.md").read_text(encoding="utf-8")
    normalized_readme = " ".join(readme.split())
    normalized_migration = " ".join(migration.split())
    normalized_standard = " ".join(generated_standard.split())

    require(
        "primary interface" in normalized_readme and "$scaffold" in readme,
        "$scaffold is not documented as the primary interface",
    )
    require(
        "new repositories" in normalized_readme and "legacy-fixed" in readme,
        "legacy generator is not limited to new repositories",
    )
    require("Python profiles" in readme, "Python-specific legacy profiles are not identified")
    require(
        "Existing-repository adoption" in readme and "unsupported" in normalized_readme,
        "README lacks the unsupported adoption/update boundary",
    )
    require(
        "new, empty destination" in normalized_migration,
        "migration guide lacks the empty-destination boundary",
    )
    require(
        "does not audit or adopt an existing repository" in normalized_migration,
        "migration guide advertises Copier adoption",
    )
    require(
        "project-update workflow is unsupported" in normalized_standard,
        "generated standard advertises Copier updates",
    )

    public_contract_files = [
        ROOT / "AGENTS.md",
        ROOT / "README.md",
        ROOT / "docs" / "migrating-from-legacy-fixed.md",
        ROOT / "tasks" / "plan.md",
        ROOT / "tasks" / "todo.md",
        ROOT / "copier.yml",
        ROOT / "template" / "AGENTS.md.jinja",
        ROOT / "template" / "README.md.jinja",
        ROOT / "template" / "REPO-STANDARD.md",
    ]
    for path in public_contract_files:
        text = path.read_text(encoding="utf-8")
        require(
            re.search(r"\bcopier\s+update\b", text, re.IGNORECASE) is None,
            f"unsupported Copier update command is advertised in {path.relative_to(ROOT)}",
        )

    for optional_root in (ROOT / "profiles", ROOT / "fragments"):
        if optional_root.exists():
            require(
                any(path.is_file() for path in optional_root.rglob("*")),
                f"empty optional structure is not allowed: {optional_root.name}",
            )


def validate_evaluation_fixture_schema() -> None:
    payload = json.loads(EVALUATION_FIXTURE.read_text(encoding="utf-8"))
    require(payload.get("schema_version") == 1, "unsupported evaluation fixture schema")
    purpose = payload.get("purpose", "").lower()
    require(
        "behavioural" in purpose and "do not compute" in purpose,
        "fixture purpose must distinguish behavioural review from deterministic decisions",
    )

    cases = payload.get("cases")
    require(isinstance(cases, list), "evaluation cases must be a list")
    expected_ids = {
        "atlas-shaped-preservation",
        "minimal-existing-cli",
        "intentional-custom-documentation",
        "empty-new-repository",
        "no-structural-change-justified",
    }
    case_ids = {case.get("id") for case in cases if isinstance(case, dict)}
    require(case_ids == expected_ids, "evaluation corpus does not contain the required scenarios")
    require(len(cases) == len(case_ids), "evaluation case ids must be unique")

    required_fields = {
        "id",
        "mode",
        "inputs_and_signals",
        "expected_recommendation",
        "structures_to_preserve",
        "prohibited_recommendations",
        "review_criteria",
    }
    for case in cases:
        case_id = case.get("id", "<missing>")
        require(set(case) == required_fields, f"unexpected fields in evaluation case {case_id}")
        require(case["mode"] in {"new", "adopt", "audit"}, f"invalid mode in evaluation case {case_id}")
        inputs = case["inputs_and_signals"]
        require(
            isinstance(inputs, dict) and inputs,
            f"inputs_and_signals must be an object in {case_id}",
        )
        require(
            isinstance(inputs.get("signals"), list) and inputs["signals"],
            f"signals must be non-empty in {case_id}",
        )
        require(
            isinstance(case["expected_recommendation"], str)
            and case["expected_recommendation"].strip(),
            f"expected recommendation is missing in {case_id}",
        )
        for field in ("structures_to_preserve", "prohibited_recommendations", "review_criteria"):
            require(isinstance(case[field], list), f"{field} must be a list in {case_id}")
        require(case["prohibited_recommendations"], f"prohibited recommendations are missing in {case_id}")
        require(case["review_criteria"], f"review criteria are missing in {case_id}")


def validate_shell_syntax() -> None:
    shell_files = [
        ROOT / "bin" / "new-repo.sh",
        ROOT / "tests" / "verify-template.sh",
        ROOT / "template" / "bin" / "validate-repository.sh.jinja",
    ]
    for path in shell_files:
        result = subprocess.run(
            ["bash", "-n", str(path)],
            check=False,
            capture_output=True,
            text=True,
        )
        require(
            result.returncode == 0,
            f"shell syntax failed for {path.relative_to(ROOT)}: {result.stderr.strip()}",
        )


def main() -> None:
    validate_skill()
    validate_legacy_contract()
    validate_evaluation_fixture_schema()
    validate_shell_syntax()
    print("deterministic toolkit validation passed (structure and evaluation schema only)")


if __name__ == "__main__":
    main()
