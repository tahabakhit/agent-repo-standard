#!/usr/bin/env python3
"""Run the five-task native/kernel behavioral pack on already-available hosts."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

WORKFLOW = Path(__file__).resolve().parents[1]
KERNEL = WORKFLOW / "kernel"
FIXTURES = Path(__file__).parent / "fixtures" / "portable-kernel"
RUNS = Path(__file__).parent / ".runs"
RESULTS = Path(__file__).parent / "results"
CANONICAL_SKILL = WORKFLOW / "skills" / "amanar-workflow" / "SKILL.md"
EXPECTED_TASKS = {
    "task1-bounded", "task2-review", "task3-recovery", "task4-authority", "task5-ownership"
}


def load_tasks() -> list[dict[str, Any]]:
    tasks = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(FIXTURES.glob("*.json"))]
    ids = {task["id"] for task in tasks}
    if ids != EXPECTED_TASKS:
        raise RuntimeError(f"behavioral fixture mismatch: {sorted(ids)}")
    return tasks


def run_quiet(args: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    environment = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    environment.pop("COVERAGE_PROCESS_START", None)
    environment.pop("COVERAGE_FILE", None)
    return subprocess.run(
        args, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=environment,
    )


def materialize(task: dict[str, Any], host: str, mode: str) -> Path:
    target = RUNS / host / mode / task["id"]
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    for name, content in task["files"].items():
        path = target / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    (target / ".gitignore").write_text(".amanar/run/\n__pycache__/\n*.pyc\n", encoding="utf-8")

    if mode == "kernel":
        control = target / ".amanar"
        control.mkdir()
        (control / "workflow.json").write_text(
            json.dumps(task["contract"], indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        local_kernel = control / "kernel"
        local_kernel.mkdir()
        shutil.copy2(KERNEL / "VERSION", local_kernel / "VERSION")
        shutil.copy2(KERNEL / "amanar-workflow", local_kernel / "amanar-workflow")
        shutil.copytree(
            KERNEL / "amanar_workflow", local_kernel / "amanar_workflow",
            ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
        )
        skill_base = target / (".claude/skills" if host == "claude" else ".agents/skills")
        skill = skill_base / "amanar-workflow"
        skill.mkdir(parents=True)
        shutil.copy2(CANONICAL_SKILL, skill / "SKILL.md")

    for command in (
        ["git", "init", "-q"],
        ["git", "config", "user.email", "benchmark@example.invalid"],
        ["git", "config", "user.name", "Amanar Benchmark"],
        ["git", "add", "-A"],
        ["git", "commit", "-qm", "behavioral fixture"],
    ):
        subprocess.run(command, cwd=target, check=True, stdout=subprocess.DEVNULL)
    return target


def host_version(host: str) -> str | None:
    executable = shutil.which(host)
    if not executable:
        return None
    result = subprocess.run([executable, "--version"], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return result.stdout.strip() if result.returncode == 0 else "present-version-unavailable"


def host_command(host: str, fixture: Path, prompt: str, model: str) -> list[str] | None:
    if host == "codex":
        return [
            "codex", "exec", "--model", model, "--config", 'model_reasoning_effort="low"',
            "--ephemeral", "--disable", "plugins", "--sandbox", "workspace-write",
            "--json", "-C", str(fixture), prompt,
        ]
    if host == "claude":
        return [
            "claude", "-p", "--no-session-persistence", "--setting-sources", "project",
            "--permission-mode", "acceptEdits", "--output-format", "json",
            "--model", "sonnet", "--effort", "low", prompt,
        ]
    return None


def invoke(command: list[str], cwd: Path, timeout: int) -> tuple[int | None, str, str, bool]:
    process = subprocess.Popen(
        command, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        start_new_session=True, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout)
        return process.returncode, stdout, stderr, False
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        stdout, stderr = process.communicate()
        return None, stdout, stderr, True


def token_usage(output: str) -> dict[str, int] | None:
    totals: dict[str, int] = {}

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                if key in {"input_tokens", "output_tokens", "cached_input_tokens"} and type(item) is int:
                    totals[key] = max(totals.get(key, 0), item)
                else:
                    visit(item)
        elif isinstance(value, list):
            for item in value:
                visit(item)

    for line in output.splitlines():
        try:
            visit(json.loads(line))
        except json.JSONDecodeError:
            continue
    return totals or None


def evaluate(task: dict[str, Any], fixture: Path, host_output: str, mode: str) -> tuple[bool, list[str], list[str]]:
    acceptance = task["acceptance"]
    problems: list[str] = []
    receipts: list[str] = []
    command = acceptance.get("command")
    if command:
        result = run_quiet(command, fixture)
        combined = result.stdout + result.stderr
        if result.returncode != 0 or acceptance.get("outputContains", "") not in combined:
            problems.append(f"acceptance command failed with {result.returncode}")
    for identifier in acceptance.get("identifiers", []):
        if identifier not in host_output:
            problems.append(f"host output missing {identifier}")
    forbidden = acceptance.get("forbidden")
    if forbidden and (fixture / forbidden).exists():
        problems.append(f"forbidden effect exists: {forbidden}")
    if acceptance["readOnly"]:
        status = run_quiet(["git", "status", "--porcelain"], fixture)
        if status.stdout:
            problems.append("read-only repository changed")
        if mode == "kernel" and (fixture / ".amanar/run").exists():
            problems.append("read-only kernel task wrote runtime state")
    elif mode == "kernel":
        controller = fixture / ".amanar/kernel/amanar-workflow"
        status = run_quiet([sys.executable, str(controller), "status", "--json"], fixture)
        try:
            record = json.loads(status.stdout)
        except json.JSONDecodeError:
            record = {}
        if status.returncode != 0 or record.get("status") != "verified" or not record.get("current"):
            problems.append("kernel workflow is not currently verified")
        receipt_root = fixture / ".amanar/run/receipts"
        receipts = sorted(path.name for path in receipt_root.glob("*.json")) if receipt_root.exists() else []
        if len(receipts) != len(task["contract"]["checks"]):
            problems.append("kernel receipts are incomplete")
    return not problems, problems, receipts


def run_trial(host: str, mode: str, task: dict[str, Any], model: str, timeout: int, version: str | None) -> dict[str, Any]:
    fixture = materialize(task, host, mode)
    prompt = task["prompt"]
    if mode == "kernel":
        prompt = (
            "$amanar-workflow\n\nThe repository-local controller is "
            "`.amanar/kernel/amanar-workflow`; invoke it with Python from the repository root.\n\n"
            + prompt
        )
    command = host_command(host, fixture, prompt, model)
    record: dict[str, Any] = {
        "host": host, "hostVersion": version, "model": model if host == "codex" else "sonnet",
        "reasoningEffort": "low", "mode": mode, "task": task["id"],
        "acceptance": False, "receipts": [], "environmentFailure": None,
    }
    if version is None or command is None:
        record["environmentFailure"] = f"{host} CLI unavailable or unverified"
        return record
    started = time.monotonic()
    exit_code, stdout, stderr, timed_out = invoke(command, fixture, timeout)
    record.update({
        "durationSeconds": round(time.monotonic() - started, 3),
        "exitCode": exit_code, "timedOut": timed_out, "tokenUsage": token_usage(stdout),
    })
    evidence_dir = RESULTS / host / mode
    evidence_dir.mkdir(parents=True, exist_ok=True)
    (evidence_dir / f"{task['id']}.stdout").write_text(stdout, encoding="utf-8")
    (evidence_dir / f"{task['id']}.stderr").write_text(stderr, encoding="utf-8")
    if timed_out:
        record["environmentFailure"] = "host invocation timed out"
    elif exit_code != 0:
        lowered = (stdout + stderr).lower()
        kind = "authentication/organization unavailable" if "403" in lowered or "forbidden" in lowered else "host invocation failed"
        record["environmentFailure"] = kind
    else:
        accepted, problems, receipts = evaluate(task, fixture, stdout + stderr, mode)
        record.update({"acceptance": accepted, "acceptanceProblems": problems, "receipts": receipts})
    print(json.dumps(record, sort_keys=True), flush=True)
    return record


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", choices=("codex", "claude", "pi", "hermes"), required=True)
    parser.add_argument("--mode", choices=("native", "kernel", "both"), default="both")
    parser.add_argument("--model", default="gpt-5.6-sol")
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()
    version = host_version(args.host)
    modes = ("native", "kernel") if args.mode == "both" else (args.mode,)
    records = [
        run_trial(args.host, mode, task, args.model, args.timeout, version)
        for task in load_tasks() for mode in modes
    ]
    RESULTS.mkdir(parents=True, exist_ok=True)
    output = RESULTS / f"{args.host}-{args.mode}.json"
    output.write_text(json.dumps(records, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    unavailable = all(record["environmentFailure"] for record in records)
    failed = any(not record["acceptance"] and not record["environmentFailure"] for record in records)
    print(f"AMANAR_PACK host={args.host} accepted={sum(r['acceptance'] for r in records)}/{len(records)} output={output}")
    return 2 if unavailable else (1 if failed else 0)


if __name__ == "__main__":
    raise SystemExit(main())
