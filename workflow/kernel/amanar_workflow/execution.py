"""Check subprocess execution with bounded evidence and process-group timeouts."""
from __future__ import annotations

import hashlib
import os
import re
import signal
import subprocess
import tempfile
from pathlib import Path
from typing import Any

MAX_OUTPUT = 256 * 1024


def parse_tests(parser: str, output: str) -> int | None:
    if parser == "none":
        return 0
    patterns = {
        "unittest": [r"Ran\s+(\d+)\s+tests?"],
        "pytest": [r"(?:^|\s)(\d+)\s+passed(?:\s|,|$)"],
        "tap": [r"(?m)^1\.\.(\d+)\s*$"],
    }
    values = [int(value) for pattern in patterns[parser] for value in re.findall(pattern, output)]
    return max(values) if values else None


def _bounded_copy(source: Path, target: Path) -> tuple[str, bool, str]:
    size = source.stat().st_size
    data = source.read_bytes()[:MAX_OUTPUT]
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    output_digest = hashlib.sha256(data).hexdigest()
    return data.decode("utf-8", errors="replace"), size > MAX_OUTPUT, output_digest


def _descendant_pids(parent_pid: int) -> set[int]:
    result = subprocess.run(
        ["ps", "-axo", "pid=,ppid="], stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, text=True,
    )
    if result.returncode != 0:
        return set()
    children: dict[int, set[int]] = {}
    for line in result.stdout.splitlines():
        fields = line.split()
        if len(fields) != 2:
            continue
        pid, parent = map(int, fields)
        children.setdefault(parent, set()).add(pid)
    descendants: set[int] = set()
    pending = [parent_pid]
    while pending:
        children_to_add = children.get(pending.pop(), set()) - descendants
        descendants.update(children_to_add)
        pending.extend(children_to_add)
    return descendants


def _signal_pids(pids: set[int], action: signal.Signals) -> None:
    for pid in pids:
        try:
            os.kill(pid, action)
        except ProcessLookupError:
            pass


def _kill_process_tree(process: subprocess.Popen[bytes]) -> None:
    try:
        os.killpg(process.pid, signal.SIGSTOP)
    except ProcessLookupError:
        pass
    descendants: set[int] = set()
    for _ in range(3):
        found = _descendant_pids(process.pid)
        _signal_pids(found, signal.SIGSTOP)
        if found <= descendants:
            break
        descendants.update(found)
    _signal_pids(descendants, signal.SIGKILL)
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def run(root: Path, run_dir: Path, check: dict[str, Any]) -> dict[str, Any]:
    output_dir = run_dir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=run_dir) as temporary:
        temporary_root = Path(temporary)
        stdout_path = temporary_root / "stdout"
        stderr_path = temporary_root / "stderr"
        with stdout_path.open("wb") as stdout, stderr_path.open("wb") as stderr:
            process = subprocess.Popen(
                check["command"], shell=True, cwd=root, stdout=stdout, stderr=stderr,
                start_new_session=True,
            )
            timed_out = False
            try:
                process.wait(timeout=check["timeoutSeconds"])
            except subprocess.TimeoutExpired:
                timed_out = True
                _kill_process_tree(process)
                process.wait()
        stdout_text, stdout_truncated, stdout_digest = _bounded_copy(
            stdout_path, output_dir / f"{check['id']}.stdout",
        )
        stderr_text, stderr_truncated, stderr_digest = _bounded_copy(
            stderr_path, output_dir / f"{check['id']}.stderr",
        )

    combined = stdout_text + "\n" + stderr_text
    discovered = parse_tests(check["testParser"], combined)
    tokens_present = all(token in combined for token in check["outputContains"])
    tests_present = discovered is not None and discovered >= check["minTests"]
    passed = not timed_out and process.returncode == check["expectedExit"] and tokens_present and tests_present
    return {
        "exitCode": process.returncode,
        "timedOut": timed_out,
        "discoveredTests": discovered,
        "stdoutSha256": stdout_digest,
        "stderrSha256": stderr_digest,
        "stdoutTruncated": stdout_truncated,
        "stderrTruncated": stderr_truncated,
        "stdout": stdout_text,
        "stderr": stderr_text,
        "passed": passed,
    }
