/**
 * Check subprocess execution with bounded evidence and process-group timeouts.
 * Mirrors amanar_workflow/execution.py exactly.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

export const MAX_OUTPUT = 256 * 1024;

export function parseTests(parser: string, output: string): number | null {
  if (parser === 'none') return 0;
  const patterns: Record<string, RegExp[]> = {
    unittest: [/Ran\s+(\d+)\s+tests?/g],
    pytest: [/(?:^|\s)(\d+)\s+passed(?:\s|,|$)/gm],
    tap: [/^1\.\.(\d+)\s*$/gm],
  };
  const regexes = patterns[parser];
  const values: number[] = [];
  for (const re of regexes) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(output)) !== null) {
      values.push(parseInt(m[1], 10));
    }
  }
  return values.length > 0 ? Math.max(...values) : null;
}

function boundedCopy(source: string, target: string): [string, boolean, string] {
  const size = fs.statSync(source).size;
  const allData = fs.readFileSync(source);
  const data = size > MAX_OUTPUT ? allData.subarray(0, MAX_OUTPUT) : allData;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
  const outputDigest = crypto.createHash('sha256').update(data).digest('hex');
  return [data.toString('utf8'), size > MAX_OUTPUT, outputDigest];
}

function descendantPids(parentPid: number): Set<number> {
  const result = spawnSync('ps', ['-axo', 'pid=,ppid='], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) return new Set();
  const children = new Map<number, Set<number>>();
  for (const line of result.stdout.split('\n')) {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 2) continue;
    const pid = parseInt(fields[0], 10);
    const ppid = parseInt(fields[1], 10);
    if (isNaN(pid) || isNaN(ppid)) continue;
    if (!children.has(ppid)) children.set(ppid, new Set());
    children.get(ppid)!.add(pid);
  }
  const descendants = new Set<number>();
  const pending = [parentPid];
  while (pending.length > 0) {
    const p = pending.pop()!;
    const childs = children.get(p) ?? new Set<number>();
    for (const c of childs) {
      if (!descendants.has(c)) {
        descendants.add(c);
        pending.push(c);
      }
    }
  }
  return descendants;
}

function signalPids(pids: Set<number>, signal: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      /* ESRCH — process already gone */
    }
  }
}

function killProcessTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid == null) return;
  // Stop the process group (child is its own PGID since detached: true)
  try {
    process.kill(-pid, 'SIGSTOP');
  } catch {
    /* already gone */
  }
  // Discover and stop descendants (up to 3 rounds, catching any late spawns)
  let descendants = new Set<number>();
  for (let i = 0; i < 3; i++) {
    const found = descendantPids(pid);
    signalPids(found, 'SIGSTOP');
    // Check if found is a subset of descendants (no new processes)
    const isSubset = [...found].every(p => descendants.has(p));
    if (isSubset) break;
    for (const p of found) descendants.add(p);
  }
  // Kill all discovered descendants
  signalPids(descendants, 'SIGKILL');
  // Kill the process group
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
}

export interface RunResult {
  exitCode: number;
  timedOut: boolean;
  discoveredTests: number | null;
  stdoutSha256: string;
  stderrSha256: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  stdout: string;
  stderr: string;
  passed: boolean;
}

export async function runCheck(
  root: string,
  runDir: string,
  check: Record<string, unknown>,
): Promise<RunResult> {
  const outputDir = path.join(runDir, 'output');
  fs.mkdirSync(outputDir, { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(runDir, 'tmp-'));
  try {
    const stdoutPath = path.join(tmpDir, 'stdout');
    const stderrPath = path.join(tmpDir, 'stderr');

    const stdoutFd = fs.openSync(stdoutPath, 'w');
    const stderrFd = fs.openSync(stderrPath, 'w');

    const child = spawn(check['command'] as string, {
      shell: true,
      cwd: root,
      stdio: ['ignore', stdoutFd, stderrFd],
      detached: true,  // new process group — equiv. to start_new_session=True
    });

    // Close the fds in the parent; child has its own copies
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);

    let timedOut = false;
    const exitCode = await new Promise<number>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;

      timer = setTimeout(() => {
        timer = null;
        timedOut = true;
        killProcessTree(child);
      }, (check['timeoutSeconds'] as number) * 1000);

      child.on('close', (code) => {
        if (timer !== null) clearTimeout(timer);
        resolve(code ?? 1);
      });

      child.on('error', () => {
        if (timer !== null) clearTimeout(timer);
        resolve(1);
      });
    });

    const [stdoutText, stdoutTruncated, stdoutDigest] = boundedCopy(
      stdoutPath,
      path.join(outputDir, `${check['id']}.stdout`),
    );
    const [stderrText, stderrTruncated, stderrDigest] = boundedCopy(
      stderrPath,
      path.join(outputDir, `${check['id']}.stderr`),
    );

    const combined = stdoutText + '\n' + stderrText;
    const discovered = parseTests(check['testParser'] as string, combined);
    const tokensPresent = (check['outputContains'] as string[]).every(
      token => combined.includes(token),
    );
    const testsPresent = discovered !== null && discovered >= (check['minTests'] as number);
    const passed = !timedOut && exitCode === check['expectedExit'] && tokensPresent && testsPresent;

    return {
      exitCode,
      timedOut,
      discoveredTests: discovered,
      stdoutSha256: stdoutDigest,
      stderrSha256: stderrDigest,
      stdoutTruncated,
      stderrTruncated,
      stdout: stdoutText,
      stderr: stderrText,
      passed,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
