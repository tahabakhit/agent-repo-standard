/**
 * Faithful TypeScript port of test_receipts.py.
 * All 4 test cases preserved.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { checkHash, workflowHash } from '../src/contract.ts';
import { WorkflowError } from '../src/errors.ts';
import { _fileDigest, receiptProblem, sourceSnapshot } from '../src/receipts.ts';
import { readState } from '../src/state.ts';

function baseContract(): Record<string, unknown> {
  return {
    schemaVersion: '1.0.0',
    id: 'controller-fixture',
    objective: 'Exercise the controller',
    scope: ['src.txt', 'result.txt'],
    exclusions: [],
    artifacts: ['result.txt'],
    authority: { repositoryWrites: true, liveEffects: false },
    checks: [{
      id: 'tests',
      command: 'python3 -m unittest discover -s tests -v',
      expectedExit: 0,
      outputContains: ['OK'],
      timeoutSeconds: 10,
      minTests: 1,
      testParser: 'unittest',
      liveEffect: false,
    }],
  };
}

function validReceipt(contract: Record<string, unknown>): Record<string, unknown> {
  const check = (contract['checks'] as Record<string, unknown>[])[0];
  return {
    receiptVersion: '1.0.0',
    workflowId: contract['id'],
    workflowHash: workflowHash(contract),
    checkId: check['id'],
    checkDefinitionHash: checkHash(check),
    sourceDigest: 'a'.repeat(64),
    command: check['command'],
    exitCode: check['expectedExit'],
    discoveredTests: check['minTests'],
    stdoutSha256: 'b'.repeat(64),
    stderrSha256: 'c'.repeat(64),
    stdoutTruncated: false,
    stderrTruncated: false,
    timedOut: false,
    passed: true,
    recordedAt: new Date().toISOString(),
  };
}

describe('Receipt validation', () => {
  test('valid receipt is current', () => {
    const contract = baseContract();
    const receipt = validReceipt(contract);
    const check = (contract['checks'] as Record<string, unknown>[])[0];
    assert.equal(receiptProblem(receipt, contract, check, 'a'.repeat(64)), null);
  });

  test('each receipt gate rejects', () => {
    const contract = baseContract();
    const check = (contract['checks'] as Record<string, unknown>[])[0];
    const changes: Array<[string, unknown, string]> = [
      ['receiptVersion', '2', 'identity'],
      ['stdoutSha256', 'bad', 'digest'],
      ['discoveredTests', 'one', 'test count is invalid'],
      ['timedOut', 0, 'boolean'],
      ['recordedAt', 'yesterday', 'timestamp'],
      ['workflowHash', 'd'.repeat(64), 'stale workflowHash'],
      ['passed', false, 'did not pass'],
      ['exitCode', 1, 'exit code'],
      ['discoveredTests', null, 'test count is insufficient'],
    ];
    for (const [field, value, expected] of changes) {
      const receipt = { ...validReceipt(contract), [field]: value };
      const problem = receiptProblem(receipt, contract, check, 'a'.repeat(64));
      assert.ok(
        problem !== null && problem.includes(expected),
        `field=${field} value=${JSON.stringify(value)}: expected "${expected}" in "${problem}"`,
      );
    }
  });

  test('git and symlink source branches', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-receipts-test-'));
    try {
      // Non-git directory should throw WorkflowError
      assert.throws(() => sourceSnapshot(tmpDir), WorkflowError);

      // Symlink digest differs from file digest
      const target = path.join(tmpDir, 'target');
      fs.writeFileSync(target, 'value');
      const link = path.join(tmpDir, 'link');
      fs.symlinkSync('target', link);
      assert.notEqual(_fileDigest(link), _fileDigest(target));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('state rejects malformed and unknown status', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-state-test-'));
    try {
      const statePath = path.join(tmpDir, 'state.json');
      fs.writeFileSync(statePath, '{');
      assert.throws(() => readState(statePath), WorkflowError);
      fs.writeFileSync(statePath, '{"status":"invented"}');
      assert.throws(() => readState(statePath), WorkflowError);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
