/**
 * Bounded-loop runner for a single Amanar workflow.
 *
 * The runner owns control flow in deterministic code: each iteration invokes
 * a host with a fresh context to mutate the repository, then the *runner* —
 * not the agent — drives the controller (`begin`, `run-check`, `verify`) and
 * grades world-state from `status --json`. This absorbs the measured
 * single-shot failure modes (agent forgets `verify`, or spuriously `block`s a
 * workflow whose acceptance is met): the runner always resumes from `blocked`,
 * always runs the declared checks, and always verifies.
 *
 * Bounded: at most `--max-iterations`. Grades world-state, not transcript.
 * Gates on `pass^k`: after the controller reports verified, each declared
 * check command must pass on `k` direct re-runs. Loops only mechanical,
 * verifiable work.
 *
 * Port of workflow/loop/run_loop.py.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  MARKER_KEYS,
  detectPlaceholders,
  detectTestTampering,
  snapshotTests,
} from './guards.ts';
import { hostCommand } from './hosts.ts';

export const AUTHORITY_DENIED = 3;

export class LoopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoopError';
  }
}

export type SpawnResult = {
  returncode: number;
  stdout: string;
  stderr: string;
};

export function controller(root: string, ...args: string[]): SpawnResult {
  const cli = path.join(root, '.amanar', 'kernel', 'amanar-workflow.ts');
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  return {
    returncode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function status(root: string): Record<string, unknown> {
  const result = controller(root, 'status', '--json');
  if (!(result.stdout ?? '').trim()) {
    throw new LoopError(`controller status failed: ${(result.stderr ?? '').trim()}`);
  }
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

export function loadContract(root: string): Record<string, unknown> {
  const p = path.join(root, '.amanar', 'workflow.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
}

export function buildPrompt(contract: Record<string, unknown>, lastFailing: string): string {
  const checks = contract['checks'] as Array<Record<string, unknown>>;
  const scope = contract['scope'] as string[];
  const exclusions = contract['exclusions'] as string[];
  const lines: string[] = [
    `Objective: ${contract['objective']}`,
    'Edit the repository so every acceptance check passes:',
    ...checks.map(c => `  - ${c['command']}`),
    `Edit only these paths: ${scope.join(', ')}.`,
  ];
  if (exclusions && exclusions.length > 0) {
    lines.push(`Never edit: ${exclusions.join(', ')}.`);
  }
  lines.push('Do not edit tests to force a pass. Do not run deployment or live-effect commands.');
  if (lastFailing) {
    lines.push('\nThe previous attempt left these failing:\n' + lastFailing);
  }
  return lines.join('\n');
}

export type AgentFn = (
  host: string,
  root: string,
  prompt: string,
  model: string,
  effort: string,
  timeout: number,
) => [number | null, string];

export function invokeAgent(
  host: string,
  root: string,
  prompt: string,
  model: string,
  effort: string,
  timeout: number,
): [number | null, string] {
  const command = hostCommand(host, root, prompt, model, effort);
  if (command === null) {
    throw new LoopError(`host has no headless invocation: ${host}`);
  }
  const result = spawnSync(command[0], command.slice(1), {
    cwd: root,
    encoding: 'utf8',
    timeout: timeout * 1000, // convert seconds to milliseconds
  });
  if (result.error !== undefined) {
    return [null, 'host invocation timed out'];
  }
  return [result.status, (result.stdout ?? '') + (result.stderr ?? '')];
}

export function advance(
  root: string,
  contract: Record<string, unknown>,
): Record<string, unknown> {
  /**
   * Runner-owned controller cycle: ensure implementing, run checks, verify.
   */
  let record = status(root);
  const recordedStatus = record['recordedStatus'];
  if (recordedStatus === null || recordedStatus === undefined || recordedStatus === 'planned' || recordedStatus === 'blocked') {
    const begun = controller(root, 'begin');
    if (begun.returncode === AUTHORITY_DENIED) {
      return { status: 'authority-required', current: false, detail: begun.stderr.trim() };
    }
  }
  const checks = contract['checks'] as Array<Record<string, unknown>>;
  const failing: string[] = [];
  for (const check of checks) {
    const checked = controller(root, 'run-check', check['id'] as string);
    if (checked.returncode === AUTHORITY_DENIED) {
      return { status: 'authority-required', current: false, detail: checked.stderr.trim() };
    }
    if (checked.returncode !== 0) {
      const combined = ((checked.stdout ?? '') + (checked.stderr ?? '')).trim();
      failing.push(`[${check['id']}] ${combined.slice(-600)}`);
    }
  }
  controller(root, 'verify');
  record = status(root);
  record['failing'] = failing;
  return record;
}

export function passesK(
  root: string,
  contract: Record<string, unknown>,
  k: number,
): boolean {
  /**
   * pass^k gate: each declared check command passes on k direct re-runs.
   */
  const checks = contract['checks'] as Array<Record<string, unknown>>;
  for (let i = 0; i < Math.max(k, 0); i++) {
    for (const check of checks) {
      const result = spawnSync(check['command'] as string, [], {
        shell: true,
        cwd: root,
        encoding: 'utf8',
        timeout: (check['timeoutSeconds'] as number) * 1000,
      });
      if (result.error !== undefined) {
        return false;
      }
      if (result.status !== (check['expectedExit'] as number)) {
        return false;
      }
      const combined = (result.stdout ?? '') + (result.stderr ?? '');
      const outputContains = check['outputContains'] as string[];
      if (!outputContains.every(token => combined.includes(token))) {
        return false;
      }
    }
  }
  return true;
}

export function verified(record: Record<string, unknown>): boolean {
  return record['status'] === 'verified' && record['current'] === true;
}

export type LoopResult = {
  outcome: string;
  iterations?: number;
  iteration?: number;
  detail?: string;
  failing?: string;
};

export function loop(
  root: string,
  host: string,
  model: string,
  effort: string,
  maxIterations: number,
  passK: number,
  timeout: number,
  agent: AgentFn = invokeAgent,
  allowedMarkers?: Set<string> | null,
): LoopResult {
  const contract = loadContract(root);
  const preflight = controller(root, 'validate');
  if (preflight.returncode !== 0) {
    return { outcome: 'invalid-contract', detail: preflight.stderr.trim() };
  }

  if (verified(status(root)) && passesK(root, contract, passK)) {
    return { outcome: 'verified', iterations: 0 };
  }

  // Capture test-file hashes before any agent mutation so we can detect
  // any weakening or deletion of tests during the run.
  const testBaseline = snapshotTests(root, contract as { scope?: string[] });

  let lastFailing = '';
  let lastGuardFailure: string | null = null;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    agent(host, root, buildPrompt(contract, lastFailing), model, effort, timeout);

    // --- structural guards (run before controller grading) ---
    const tampered = detectTestTampering(root, contract as { scope?: string[] }, testBaseline);
    const placeholders = detectPlaceholders(root, contract as { scope?: string[] }, allowedMarkers);

    if (tampered.length > 0 || placeholders.length > 0) {
      const parts: string[] = [];
      if (tampered.length > 0) {
        lastGuardFailure = 'test-tampering';
        parts.push('Test files modified or deleted: ' + tampered.join(', '));
      }
      if (placeholders.length > 0) {
        if (tampered.length === 0) {
          lastGuardFailure = 'placeholder-detected';
        }
        parts.push(
          'Placeholder code found: ' +
          placeholders.map(([p, m]) => `${p} [${m}]`).join('; '),
        );
      }
      lastFailing = parts.join('\n');
      continue; // do not advance to controller grading this iteration
    }

    lastGuardFailure = null;
    const record = advance(root, contract);
    if (record['status'] === 'authority-required') {
      return {
        outcome: 'authority-required',
        iteration,
        detail: record['detail'] as string | undefined,
      };
    }
    if (verified(record) && passesK(root, contract, passK)) {
      return { outcome: 'verified', iterations: iteration };
    }
    const failing = record['failing'] as string[] | undefined;
    lastFailing = (failing ?? []).join('\n');
  }

  if (lastGuardFailure !== null) {
    return { outcome: lastGuardFailure, iterations: maxIterations, failing: lastFailing };
  }
  return { outcome: 'exhausted', iterations: maxIterations, failing: lastFailing };
}

// Re-export MARKER_KEYS for the CLI entry point.
export { MARKER_KEYS };
