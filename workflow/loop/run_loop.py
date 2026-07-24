#!/usr/bin/env python3
"""Bounded-loop runner for a single Amanar workflow.

The runner owns control flow in deterministic code: each iteration invokes a host
with a fresh context to mutate the repository, then the *runner* — not the agent —
drives the controller (`begin`, `run-check`, `verify`) and grades world-state from
`status --json`. This absorbs the measured single-shot failure modes (agent forgets
`verify`, or spuriously `block`s a workflow whose acceptance is met): the runner
always resumes from `blocked`, always runs the declared checks, and always verifies.

Bounded: at most `--max-iterations`. Grades world-state, not transcript. Gates on
`pass^k`: after the controller reports verified, each declared check command must
pass on `k` direct re-runs. Loops only mechanical, verifiable work.

Usage: `python3 workflow/loop/run_loop.py --host pi --root PATH`
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE))          # loop dir -> guards
sys.path.insert(0, str(_HERE.parent))   # workflow dir -> hosts

from guards import MARKER_KEYS, detect_placeholders, detect_test_tampering, snapshot_tests  # noqa: E402
from hosts import host_command  # noqa: E402

AUTHORITY_DENIED = 3


class LoopError(Exception):
    pass


def controller(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    cli = root / ".amanar" / "kernel" / "amanar-workflow.ts"
    return subprocess.run(
        ["node", str(cli), *args], cwd=root, text=True, capture_output=True,
    )


def status(root: Path) -> dict[str, Any]:
    result = controller(root, "status", "--json")
    if not result.stdout.strip():
        raise LoopError(f"controller status failed: {result.stderr.strip()}")
    return json.loads(result.stdout)


def load_contract(root: Path) -> dict[str, Any]:
    path = root / ".amanar" / "workflow.json"
    return json.loads(path.read_text(encoding="utf-8"))


def build_prompt(contract: dict[str, Any], last_failing: str) -> str:
    lines = [
        f"Objective: {contract['objective']}",
        "Edit the repository so every acceptance check passes:",
        *[f"  - {check['command']}" for check in contract["checks"]],
        f"Edit only these paths: {', '.join(contract['scope'])}.",
    ]
    if contract["exclusions"]:
        lines.append(f"Never edit: {', '.join(contract['exclusions'])}.")
    lines.append("Do not edit tests to force a pass. Do not run deployment or live-effect commands.")
    if last_failing:
        lines.append("\nThe previous attempt left these failing:\n" + last_failing)
    return "\n".join(lines)


def invoke_agent(host: str, root: Path, prompt: str, model: str, effort: str, timeout: int) -> tuple[int | None, str]:
    command = host_command(host, root, prompt, model, effort)
    if command is None:
        raise LoopError(f"host has no headless invocation: {host}")
    try:
        result = subprocess.run(command, cwd=root, text=True, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None, "host invocation timed out"
    return result.returncode, result.stdout + result.stderr


def advance(root: Path, contract: dict[str, Any]) -> dict[str, Any]:
    """Runner-owned controller cycle: ensure implementing, run checks, verify."""
    record = status(root)
    if record.get("recordedStatus") in (None, "planned", "blocked"):
        begun = controller(root, "begin")
        if begun.returncode == AUTHORITY_DENIED:
            return {"status": "authority-required", "current": False, "detail": begun.stderr.strip()}
    failing: list[str] = []
    for check in contract["checks"]:
        checked = controller(root, "run-check", check["id"])
        if checked.returncode == AUTHORITY_DENIED:
            return {"status": "authority-required", "current": False, "detail": checked.stderr.strip()}
        if checked.returncode != 0:
            failing.append(f"[{check['id']}] {(checked.stdout + checked.stderr).strip()[-600:]}")
    controller(root, "verify")
    record = status(root)
    record["failing"] = failing
    return record


def passes_k(root: Path, contract: dict[str, Any], k: int) -> bool:
    """pass^k gate: each declared check command passes on k direct re-runs."""
    for _ in range(max(k, 0)):
        for check in contract["checks"]:
            try:
                result = subprocess.run(
                    check["command"], shell=True, cwd=root, text=True,
                    capture_output=True, timeout=check["timeoutSeconds"],
                )
            except subprocess.TimeoutExpired:
                return False
            if result.returncode != check["expectedExit"]:
                return False
            combined = result.stdout + result.stderr
            if not all(token in combined for token in check["outputContains"]):
                return False
    return True


def verified(record: dict[str, Any]) -> bool:
    return record.get("status") == "verified" and record.get("current") is True


def loop(
    root: Path, host: str, model: str, effort: str, max_iterations: int, pass_k: int,
    timeout: int, agent: Callable[..., tuple[int | None, str]] = invoke_agent,
    allowed_markers: set[str] | None = None,
) -> dict[str, Any]:
    contract = load_contract(root)
    preflight = controller(root, "validate")
    if preflight.returncode != 0:
        return {"outcome": "invalid-contract", "detail": preflight.stderr.strip()}

    if verified(status(root)) and passes_k(root, contract, pass_k):
        return {"outcome": "verified", "iterations": 0}

    # Capture test-file hashes before any agent mutation so we can detect
    # any weakening or deletion of tests during the run.
    test_baseline = snapshot_tests(root, contract)

    last_failing = ""
    last_guard_failure: str | None = None
    for iteration in range(1, max_iterations + 1):
        agent(host, root, build_prompt(contract, last_failing), model, effort, timeout)

        # --- structural guards (run before controller grading) ---
        tampered = detect_test_tampering(root, contract, test_baseline)
        placeholders = detect_placeholders(root, contract, allowed_markers=allowed_markers)
        if tampered or placeholders:
            parts: list[str] = []
            if tampered:
                last_guard_failure = "test-tampering"
                parts.append(
                    "Test files modified or deleted: " + ", ".join(tampered)
                )
            if placeholders:
                if not tampered:
                    last_guard_failure = "placeholder-detected"
                parts.append(
                    "Placeholder code found: "
                    + "; ".join(f"{p} [{m}]" for p, m in placeholders)
                )
            last_failing = "\n".join(parts)
            continue  # do not advance to controller grading this iteration

        last_guard_failure = None
        record = advance(root, contract)
        if record.get("status") == "authority-required":
            return {"outcome": "authority-required", "iteration": iteration, "detail": record.get("detail")}
        if verified(record) and passes_k(root, contract, pass_k):
            return {"outcome": "verified", "iterations": iteration}
        last_failing = "\n".join(record.get("failing", []))

    if last_guard_failure:
        return {"outcome": last_guard_failure, "iterations": max_iterations, "failing": last_failing}
    return {"outcome": "exhausted", "iterations": max_iterations, "failing": last_failing}


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="run_loop")
    parser.add_argument("--host", choices=("pi", "claude", "codex"), required=True)
    parser.add_argument("--root", default=".")
    parser.add_argument("--model", default="gpt-5.6-sol")
    parser.add_argument("--effort", default="medium")
    parser.add_argument("--max-iterations", type=int, default=6)
    parser.add_argument("--pass-k", type=int, default=1)
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument(
        "--allow-marker",
        dest="allow_markers",
        action="append",
        choices=sorted(MARKER_KEYS),
        metavar="KEY",
        default=[],
        help=(
            "Allow a placeholder marker key without blocking 'verified'. "
            "May be repeated. Choices: " + ", ".join(sorted(MARKER_KEYS)) + ". "
            "Default: none (strict — all markers block 'verified')."
        ),
    )
    args = parser.parse_args(argv)
    allowed_markers: set[str] = set(args.allow_markers) if args.allow_markers else set()
    result = loop(
        Path(args.root).resolve(), args.host, args.model, args.effort,
        args.max_iterations, args.pass_k, args.timeout,
        allowed_markers=allowed_markers or None,
    )
    print(json.dumps(result, sort_keys=True))
    raise SystemExit(0 if result["outcome"] == "verified" else 1)


if __name__ == "__main__":
    main()
