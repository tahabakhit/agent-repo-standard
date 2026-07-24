/**
 * Compile an RPI task-spec into a validated .amanar/workflow.json.
 * Mirrors tools/compile_task_spec.py exactly.
 */

import fs from 'node:fs';
import path from 'node:path';
import { validate } from '../contract.ts';
import { ContractError } from '../errors.ts';

const SPEC_FIELDS = new Set(['id', 'goal', 'scope', 'blastRadius', 'artifacts', 'verify']);
const BLAST_FIELDS = new Set(['writes', 'liveEffects', 'exclusions']);
const VERIFY_FIELDS = new Set(['id', 'run', 'expectedExit', 'contains', 'timeout', 'minTests', 'parser', 'liveEffect']);

export class SpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpecError';
  }
}

function rejectUnknown(value: unknown, allowed: Set<string>, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SpecError(`${label} must be an object`);
  }
  const obj = value as Record<string, unknown>;
  const unknown = Object.keys(obj).filter(k => !allowed.has(k)).sort();
  if (unknown.length > 0) {
    throw new SpecError(`${label} has unknown fields: ${unknown.join(', ')}`);
  }
  return obj;
}

export function compileSpec(spec: unknown): Record<string, unknown> {
  const s = rejectUnknown(spec, SPEC_FIELDS, 'task spec');

  for (const required of ['id', 'goal', 'scope', 'verify']) {
    if (!(required in s)) {
      throw new SpecError(`task spec missing required field: ${required}`);
    }
  }

  const blast = rejectUnknown(s['blastRadius'] ?? {}, BLAST_FIELDS, 'blastRadius');

  const verifyRaw = s['verify'];
  if (!Array.isArray(verifyRaw) || verifyRaw.length === 0) {
    throw new SpecError('verify must be a non-empty array');
  }

  const checks: Record<string, unknown>[] = [];
  for (const entry of verifyRaw) {
    const e = rejectUnknown(entry, VERIFY_FIELDS, 'verify entry');
    for (const required of ['id', 'run']) {
      if (!(required in e)) {
        throw new SpecError(`verify entry missing required field: ${required}`);
      }
    }
    checks.push({
      id: e['id'],
      command: e['run'],
      expectedExit: e['expectedExit'] ?? 0,
      outputContains: e['contains'] ?? [],
      timeoutSeconds: e['timeout'] ?? 120,
      minTests: e['minTests'] ?? 0,
      testParser: e['parser'] ?? 'none',
      liveEffect: e['liveEffect'] ?? false,
    });
  }

  const contract = {
    schemaVersion: '1.0.0',
    id: s['id'],
    objective: s['goal'],
    scope: s['scope'],
    exclusions: (blast['exclusions'] ?? []) as unknown[],
    artifacts: (s['artifacts'] ?? []) as unknown[],
    authority: {
      repositoryWrites: blast['writes'] ?? true,
      liveEffects: blast['liveEffects'] ?? false,
    },
    checks,
  };

  return validate(contract);
}

export function main(argv: string[] = process.argv.slice(2)): void {
  // Parse args: spec [--out PATH]
  const args = argv.slice();
  const outIdx = args.indexOf('--out');
  let outPath = '.amanar/workflow.json';
  if (outIdx !== -1) {
    outPath = args[outIdx + 1];
    args.splice(outIdx, 2);
  }
  const specPath = args[0];
  if (!specPath) {
    process.stderr.write('compile_task_spec error: no spec file given\n');
    process.exit(1);
  }

  let spec: unknown;
  try {
    spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (e) {
    process.stderr.write(`compile_task_spec error: cannot read spec: ${e}\n`);
    process.exit(1);
  }

  let contract: Record<string, unknown>;
  try {
    contract = compileSpec(spec);
  } catch (e) {
    if (e instanceof SpecError || e instanceof ContractError) {
      process.stderr.write(`compile_task_spec error: ${e.message}\n`);
      process.exit(1);
    }
    throw e;
  }

  const out = path.resolve(outPath);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify(
      contract,
      (_k, v: unknown) => {
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          const sorted: Record<string, unknown> = {};
          for (const k of Object.keys(v as Record<string, unknown>).sort()) {
            sorted[k] = (v as Record<string, unknown>)[k];
          }
          return sorted;
        }
        return v;
      },
      2,
    ) + '\n',
    'utf8',
  );
  console.log(`wrote ${out}`);
}
