/**
 * Stable CLI for the Amanar workflow controller.
 * Mirrors amanar_workflow/cli.py exactly.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHash, load, workflowHash } from './contract.ts';
import { AuthorityError, CheckError, EvidenceError, IncompleteError, WorkflowError } from './errors.ts';
import { runCheck } from './execution.ts';
import {
  assertArtifacts,
  assertScope,
  outputProblem,
  receiptProblem,
  sourceSnapshot,
} from './receipts.ts';
import { now, readState, requireState, writeState } from './state.ts';

const _thisDir = path.dirname(fileURLToPath(import.meta.url));
// VERSION lives at the kernel root; this file is under src/
const _kernelDir = path.join(_thisDir, '..');
export const VERSION = fs.readFileSync(path.join(_kernelDir, 'VERSION'), 'utf8').trim();

export function paths(root: string): Record<string, string> {
  const control = path.join(root, '.amanar');
  const runDir = path.join(control, 'run');
  return {
    contract: path.join(control, 'workflow.json'),
    run: runDir,
    state: path.join(runDir, 'state.json'),
    receipts: path.join(runDir, 'receipts'),
  };
}

export function readJson(filePath: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    throw new EvidenceError(`cannot read receipt ${path.basename(filePath)}: ${e}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new EvidenceError(`receipt is not an object: ${path.basename(filePath)}`);
  }
  return value as Record<string, unknown>;
}

function writeJson(filePath: string, value: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(
    tmpPath,
    JSON.stringify(
      value,
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
  fs.renameSync(tmpPath, filePath);
}

function context(root: string): [
  Record<string, unknown>,
  Record<string, string>,
  Record<string, unknown> | null,
] {
  const location = paths(root);
  const contract = load(location['contract']);
  const state = readState(location['state']);
  if (state !== null) {
    if (state['workflowId'] !== contract['id']) {
      throw new EvidenceError('runtime state belongs to another workflow');
    }
    if (state['workflowHash'] !== workflowHash(contract)) {
      throw new EvidenceError('workflow contract changed after begin');
    }
  }
  return [contract, location, state];
}

function findCheck(contract: Record<string, unknown>, checkId: string): Record<string, unknown> {
  const check = (contract['checks'] as Record<string, unknown>[]).find(
    c => c['id'] === checkId,
  );
  if (check === undefined) {
    throw new IncompleteError(`unknown check: ${checkId}`);
  }
  return check;
}

function cmdValidate(root: string): void {
  const contract = load(paths(root)['contract']);
  console.log(`AMANAR_VALID id=${contract['id']} hash=${workflowHash(contract)}`);
}

async function cmdBegin(root: string): Promise<void> {
  const [contract, location, state] = context(root);
  if (!(contract['authority'] as Record<string, unknown>)['repositoryWrites']) {
    throw new AuthorityError('repository writes are not authorized');
  }
  requireState(state, 'planned', 'blocked');
  let s = state;
  if (s === null) {
    s = {
      workflowId: contract['id'],
      workflowHash: workflowHash(contract),
      status: 'planned',
      baseline: sourceSnapshot(root),
      createdAt: now(),
    };
  }
  const previous = s['status'];
  s['status'] = 'implementing';
  s['updatedAt'] = now();
  delete s['blockReason'];
  writeState(location['state'], s);
  console.log(`AMANAR_STATE ${previous} -> implementing`);
}

async function cmdBlock(root: string, reason: string): Promise<void> {
  const [, location, state] = context(root);
  const s = requireState(state, 'implementing');
  s['status'] = 'blocked';
  s['blockReason'] = reason;
  s['updatedAt'] = now();
  writeState(location['state'], s);
  console.log('AMANAR_STATE implementing -> blocked');
}

async function cmdRunCheck(root: string, checkId: string): Promise<void> {
  const [contract, location, state] = context(root);
  requireState(state, 'implementing');
  const s = state!;
  const check = findCheck(contract, checkId);
  if (check['liveEffect'] && !(contract['authority'] as Record<string, unknown>)['liveEffects']) {
    throw new AuthorityError(`check ${checkId} requires unauthorized live effects`);
  }
  const before = sourceSnapshot(root);
  assertScope(contract, s['baseline'] as Record<string, unknown>, before);
  const result = await runCheck(root, location['run'], check);
  const after = sourceSnapshot(root);
  let scopeError: EvidenceError | null = null;
  try {
    assertScope(contract, s['baseline'] as Record<string, unknown>, after);
  } catch (e) {
    result.passed = false;
    scopeError = e as EvidenceError;
  }
  const receipt: Record<string, unknown> = {
    receiptVersion: '1.0.0',
    workflowId: contract['id'],
    workflowHash: workflowHash(contract),
    checkId: check['id'],
    checkDefinitionHash: checkHash(check),
    sourceDigest: after['digest'],
    command: check['command'],
    exitCode: result.exitCode,
    discoveredTests: result.discoveredTests,
    stdoutSha256: result.stdoutSha256,
    stderrSha256: result.stderrSha256,
    stdoutTruncated: result.stdoutTruncated,
    stderrTruncated: result.stderrTruncated,
    timedOut: result.timedOut,
    passed: result.passed,
    recordedAt: now(),
  };
  writeJson(path.join(location['receipts'], `${checkId}.json`), receipt);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  const tests = result.discoveredTests === null ? 'unparsed' : String(result.discoveredTests);
  const outcome = result.passed ? 'PASS' : 'FAIL';
  console.log(`AMANAR_CHECK ${checkId} ${outcome} tests=${tests}`);
  if (scopeError !== null) throw scopeError;
  if (!result.passed) {
    const detail = result.timedOut ? 'timed out' : 'failed acceptance';
    throw new CheckError(`check ${checkId} ${detail}`);
  }
}

function evidenceProblems(
  root: string,
  contract: Record<string, unknown>,
  location: Record<string, string>,
  state: Record<string, unknown>,
): string[] {
  const current = sourceSnapshot(root);
  const problems: string[] = [];
  try {
    assertScope(contract, state['baseline'] as Record<string, unknown>, current);
    assertArtifacts(root, contract);
  } catch (e) {
    problems.push((e as Error).message);
  }
  for (const check of contract['checks'] as Record<string, unknown>[]) {
    const receiptPath = path.join(location['receipts'], `${check['id']}.json`);
    if (!fs.existsSync(receiptPath) || !fs.statSync(receiptPath).isFile()) {
      problems.push(`missing receipt: ${check['id']}`);
      continue;
    }
    const receipt = readJson(receiptPath);
    let problem = receiptProblem(receipt, contract, check, current['digest'] as string);
    if (problem === null) {
      problem = outputProblem(receipt, check, path.join(location['run'], 'output'));
    }
    if (problem !== null) problems.push(problem);
  }
  return problems;
}

async function cmdVerify(root: string): Promise<void> {
  const [contract, location, state] = context(root);
  requireState(state, 'implementing');
  const s = state!;
  const problems = evidenceProblems(root, contract, location, s);
  if (problems.length > 0) {
    throw new EvidenceError(problems.join('; '));
  }
  s['status'] = 'verified';
  s['verifiedAt'] = now();
  s['updatedAt'] = now();
  writeState(location['state'], s);
  console.log(`AMANAR_VERIFIED id=${contract['id']}`);
}

function cmdStatus(root: string): void {
  const contract = load(paths(root)['contract']);
  const location = paths(root);
  const state = readState(location['state']);
  const record: Record<string, unknown> = {
    schemaVersion: contract['schemaVersion'],
    workflowId: contract['id'],
    status: state === null ? 'planned' : state['status'],
    recordedStatus: state === null ? null : state['status'],
    current: state === null,
    problems: [],
  };
  if (state !== null) {
    if (state['workflowId'] !== contract['id'] || state['workflowHash'] !== workflowHash(contract)) {
      record['current'] = false;
      record['problems'] = ['workflow contract changed after begin'];
    } else {
      const problems = evidenceProblems(root, contract, location, state);
      record['problems'] = problems;
      record['current'] = problems.length === 0;
      if (state['status'] === 'verified' && problems.length > 0) {
        record['status'] = 'implementing';
      }
    }
  }
  console.log(JSON.stringify(record, Object.keys(record).sort() as unknown as null));
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const root = process.cwd();

  // Handle --version
  if (argv.includes('--version')) {
    console.log(VERSION);
    return;
  }

  const [command, ...rest] = argv;

  try {
    switch (command) {
      case 'validate':
        cmdValidate(root);
        break;
      case 'begin':
        await cmdBegin(root);
        break;
      case 'run-check': {
        const id = rest[0];
        if (!id) {
          process.stderr.write('AMANAR_ERROR run-check requires an id\n');
          process.exit(6);
        }
        await cmdRunCheck(root, id);
        break;
      }
      case 'block': {
        const reasonIdx = rest.indexOf('--reason');
        if (reasonIdx === -1 || !rest[reasonIdx + 1]) {
          process.stderr.write('AMANAR_ERROR block requires --reason\n');
          process.exit(6);
        }
        await cmdBlock(root, rest[reasonIdx + 1]);
        break;
      }
      case 'verify':
        await cmdVerify(root);
        break;
      case 'status':
        if (!rest.includes('--json')) {
          process.stderr.write('AMANAR_ERROR status requires --json\n');
          process.exit(6);
        }
        cmdStatus(root);
        break;
      default:
        process.stderr.write(`AMANAR_ERROR unknown command: ${command}\n`);
        process.exit(6);
    }
  } catch (e) {
    if (e instanceof WorkflowError) {
      process.stderr.write(`AMANAR_ERROR ${e.message}\n`);
      process.exit(e.exitCode);
    }
    throw e;
  }
}
