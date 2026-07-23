#!/usr/bin/env python3
"""Compile an RPI task-spec into a validated `.amanar/workflow.json`.

A task-spec is the human front-end to the workflow contract — GOAL, DONE-WHEN,
SCOPE, VERIFY, BLAST-RADIUS — with the controller's per-check machinery filled by
defaults. The compiled contract is validated with the kernel's own schema and
written canonically. This is an authoring helper, not part of the frozen CLI.

Usage: `python3 .amanar/kernel/tools/compile_task_spec.py SPEC.json [--out PATH]`
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # kernel dir -> amanar_workflow

from amanar_workflow.contract import validate  # noqa: E402
from amanar_workflow.errors import ContractError  # noqa: E402

SPEC_FIELDS = {"id", "goal", "scope", "blastRadius", "artifacts", "verify"}
BLAST_FIELDS = {"writes", "liveEffects", "exclusions"}
VERIFY_FIELDS = {"id", "run", "expectedExit", "contains", "timeout", "minTests", "parser", "liveEffect"}


class SpecError(Exception):
    """A task-spec that is malformed before it reaches contract validation."""


def _reject_unknown(value: object, allowed: set[str], label: str) -> dict:
    if not isinstance(value, dict):
        raise SpecError(f"{label} must be an object")
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise SpecError(f"{label} has unknown fields: {', '.join(unknown)}")
    return value


def compile_spec(spec: object) -> dict:
    _reject_unknown(spec, SPEC_FIELDS, "task spec")
    assert isinstance(spec, dict)
    for required in ("id", "goal", "scope", "verify"):
        if required not in spec:
            raise SpecError(f"task spec missing required field: {required}")
    blast = _reject_unknown(spec.get("blastRadius", {}), BLAST_FIELDS, "blastRadius")

    verify = spec["verify"]
    if not isinstance(verify, list) or not verify:
        raise SpecError("verify must be a non-empty array")
    checks = []
    for entry in verify:
        _reject_unknown(entry, VERIFY_FIELDS, "verify entry")
        for required in ("id", "run"):
            if required not in entry:
                raise SpecError(f"verify entry missing required field: {required}")
        checks.append({
            "id": entry["id"],
            "command": entry["run"],
            "expectedExit": entry.get("expectedExit", 0),
            "outputContains": entry.get("contains", []),
            "timeoutSeconds": entry.get("timeout", 120),
            "minTests": entry.get("minTests", 0),
            "testParser": entry.get("parser", "none"),
            "liveEffect": entry.get("liveEffect", False),
        })

    contract = {
        "schemaVersion": "1.0.0",
        "id": spec["id"],
        "objective": spec["goal"],
        "scope": spec["scope"],
        "exclusions": blast.get("exclusions", []),
        "artifacts": spec.get("artifacts", []),
        "authority": {
            "repositoryWrites": blast.get("writes", True),
            "liveEffects": blast.get("liveEffects", False),
        },
        "checks": checks,
    }
    return validate(contract)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="compile_task_spec")
    parser.add_argument("spec", help="task-spec JSON file")
    parser.add_argument("--out", default=".amanar/workflow.json", help="output contract path")
    args = parser.parse_args(argv)
    try:
        spec = json.loads(Path(args.spec).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        print(f"compile_task_spec error: cannot read spec: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    try:
        contract = compile_spec(spec)
    except (SpecError, ContractError) as exc:
        print(f"compile_task_spec error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(contract, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
