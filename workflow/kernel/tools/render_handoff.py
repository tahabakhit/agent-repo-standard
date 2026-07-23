#!/usr/bin/env python3
"""Deterministic resume/handoff digest for an Amanar workflow.

Read-only. Renders controller state as Markdown from `.amanar/workflow.json` and
`.amanar/run/`: the derived state, each receipt's current/stale/missing verdict, an
id/artifact closet, and the ordered rebuild to `verified`. It reuses the
controller's own freshness logic rather than reimplementing it, and is deliberately
*not* part of the frozen CLI or the workflow contract.

Resume/handoff pattern reimplemented from iamneilroberts/claude-skills (MIT).

Usage: `python3 .amanar/kernel/tools/render_handoff.py [--root PATH]`
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # kernel dir -> amanar_workflow

from amanar_workflow import cli  # noqa: E402
from amanar_workflow.contract import load, workflow_hash  # noqa: E402
from amanar_workflow.errors import WorkflowError  # noqa: E402
from amanar_workflow.receipts import output_problem, receipt_problem, source_snapshot  # noqa: E402
from amanar_workflow.state import read as read_state  # noqa: E402


def _verdict(location: dict, contract: dict, check: dict, current_digest: str | None) -> tuple[str, str]:
    receipt_path = location["receipts"] / f"{check['id']}.json"
    if not receipt_path.is_file():
        return "MISSING", "no receipt recorded"
    if current_digest is None:
        return "UNKNOWN", "source digest unavailable (not a committed git tree)"
    receipt = cli.read_json(receipt_path)
    problem = receipt_problem(receipt, contract, check, current_digest)
    if problem is None:
        problem = output_problem(receipt, check, location["run"] / "output")
    if problem:
        return "STALE", problem
    return "CURRENT", f"passed, tests={receipt.get('discoveredTests')}, at {receipt.get('recordedAt')}"


def render(root: Path) -> str:
    location = cli.paths(root)
    contract = load(location["contract"])
    state = read_state(location["state"])
    recorded = "planned" if state is None else state["status"]
    try:
        current_digest = None if state is None else source_snapshot(root)["digest"]
    except WorkflowError:
        current_digest = None

    verdicts = [(c["id"], *_verdict(location, contract, c, current_digest)) for c in contract["checks"]]
    stale = any(tag != "CURRENT" for _, tag, _ in verdicts)
    effective = "implementing" if recorded == "verified" and stale else recorded

    out: list[str] = [f"# Workflow handoff — {contract['id']}", ""]
    label = f"**{effective}**" + (f" (recorded {recorded})" if effective != recorded else "")
    out.append(f"- State: {label}")
    out.append(f"- Objective: {contract['objective']}")
    if state and state.get("blockReason"):
        out.append(f"- Blocked: {state['blockReason']}")

    out += ["", "## Receipts"]
    for cid, tag, detail in verdicts:
        out.append(f"- `{cid}`: **{tag}** — {detail}")

    out += ["", "## Closet"]
    out.append(f"- Workflow id: `{contract['id']}`")
    out.append(f"- Workflow hash: `{workflow_hash(contract)}`")
    out.append("- Scope: " + (", ".join(f"`{p}`" for p in contract["scope"]) or "(none)"))
    if contract.get("exclusions"):
        out.append("- Exclusions: " + ", ".join(f"`{p}`" for p in contract["exclusions"]))
    out.append("- Artifacts: " + (", ".join(f"`{p}`" for p in contract["artifacts"]) or "(none)"))

    out += ["", "## Rebuild to verified"]
    if effective == "verified":
        out.append("- Already verified with current receipts. No action needed.")
    else:
        steps: list[str] = []
        if effective in ("planned", "blocked"):
            steps.append("`begin` (required before any check)")
        steps += [f"`run-check {cid}` (currently {tag})" for cid, tag, _ in verdicts if tag != "CURRENT"]
        steps.append("`verify`")
        out += [f"{i}. {step}" for i, step in enumerate(steps, 1)]
    out.append("")
    return "\n".join(out)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="render_handoff")
    parser.add_argument("--root", default=".", help="repository root containing .amanar/")
    args = parser.parse_args(argv)
    try:
        sys.stdout.write(render(Path(args.root).resolve()))
    except WorkflowError as exc:
        print(f"render_handoff error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
