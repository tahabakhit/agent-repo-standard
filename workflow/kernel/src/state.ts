/**
 * Deterministic workflow state persistence.
 * Mirrors amanar_workflow/state.py exactly.
 */

import fs from 'node:fs';
import path from 'node:path';
import { IncompleteError, WorkflowError } from './errors.ts';

export function now(): string {
  return new Date().toISOString();
}

export function readState(statePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(statePath)) return null;
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (e) {
    throw new WorkflowError(`cannot read controller state: ${e}`);
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new WorkflowError('controller state is invalid');
  }
  const state = value as Record<string, unknown>;
  const validStatuses = new Set(['planned', 'implementing', 'blocked', 'verified']);
  if (!validStatuses.has(state['status'] as string)) {
    throw new WorkflowError('controller state is invalid');
  }
  return state;
}

/** Sorted JSON stringify — mirrors json.dumps(value, indent=2, sort_keys=True). */
function sortedStringify(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, val: unknown) => {
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(val as Record<string, unknown>).sort()) {
          sorted[k] = (val as Record<string, unknown>)[k];
        }
        return sorted;
      }
      return val;
    },
    2,
  );
}

export function writeState(statePath: string, value: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const tmpPath = statePath + '.tmp';
  fs.writeFileSync(tmpPath, sortedStringify(value) + '\n', 'utf8');
  fs.renameSync(tmpPath, statePath);
}

export function requireState(
  state: Record<string, unknown> | null,
  ...statuses: string[]
): Record<string, unknown> {
  const actual = state === null ? 'planned' : (state['status'] as string);
  if (!statuses.includes(actual)) {
    throw new IncompleteError(
      `invalid state: expected ${statuses.join(' or ')}, found ${actual}`,
    );
  }
  return state ?? { status: 'planned' };
}
