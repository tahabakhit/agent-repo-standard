/**
 * Faithful TypeScript port of test_compile_task_spec.py.
 * All 7 test cases preserved.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { SpecError, compileSpec } from '../src/tools/compileTaskSpec.ts';
import { main as compileMain } from '../src/tools/compileTaskSpec.ts';
import { ContractError } from '../src/errors.ts';

function spec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: 'demo',
    goal: 'do the thing',
    scope: ['src/'],
    artifacts: ['src/out.txt'],
    blastRadius: { writes: true, exclusions: ['src/vendor/'] },
    verify: [{
      id: 'tests',
      run: 'python3 -m unittest discover -s tests -v',
      contains: ['OK'],
      minTests: 1,
      parser: 'unittest',
    }],
  };
  return { ...base, ...overrides };
}

describe('Compile task spec', () => {
  test('maps RPI fields to contract', () => {
    const contract = compileSpec(spec());
    assert.equal(contract['objective'], 'do the thing');
    assert.deepEqual(contract['scope'], ['src/']);
    assert.deepEqual(contract['exclusions'], ['src/vendor/']);
    assert.deepEqual(contract['authority'], { repositoryWrites: true, liveEffects: false });
    const check = (contract['checks'] as Record<string, unknown>[])[0];
    assert.equal(check['command'], 'python3 -m unittest discover -s tests -v');
    assert.equal(check['expectedExit'], 0);
  });

  test('fills defaults for minimal spec', () => {
    const contract = compileSpec({
      id: 'm',
      goal: 'g',
      scope: ['a.txt'],
      verify: [{ id: 'c', run: 'true' }],
    });
    const check = (contract['checks'] as Record<string, unknown>[])[0];
    assert.equal(check['timeoutSeconds'], 120);
    assert.equal(check['minTests'], 0);
    assert.equal(check['testParser'], 'none');
    assert.equal(check['liveEffect'], false);
    assert.deepEqual(contract['exclusions'], []);
    assert.deepEqual(contract['artifacts'], []);
    assert.equal((contract['authority'] as Record<string, unknown>)['repositoryWrites'], true);
  });

  test('unknown spec field is rejected', () => {
    assert.throws(() => compileSpec(spec({ oops: 1 })), SpecError);
  });

  test('unknown verify field is rejected', () => {
    const bad = spec() as Record<string, unknown>;
    ((bad['verify'] as Record<string, unknown>[])[0])['timoeut'] = 5;
    assert.throws(() => compileSpec(bad), SpecError);
  });

  test('missing required field is rejected', () => {
    assert.throws(
      () => compileSpec({ id: 'x', scope: ['a.txt'], verify: [{ id: 'c', run: 'true' }] }),
      SpecError,
    );
  });

  test('minTests without parser fails contract', () => {
    assert.throws(
      () => compileSpec({
        id: 'x',
        goal: 'g',
        scope: ['a.txt'],
        verify: [{ id: 'c', run: 'true', minTests: 2 }],
      }),
      ContractError,
    );
  });

  test('main writes validated contract', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-compile-test-'));
    try {
      const specPath = path.join(tmpDir, 'spec.json');
      fs.writeFileSync(specPath, JSON.stringify(spec()));
      const outPath = path.join(tmpDir, 'workflow.json');

      // Capture exit by wrapping main — it writes a file and console.logs
      // Use original process.exit to let it succeed (exit code 0 for success)
      const origExit = process.exit.bind(process);
      let exitCalled = false;
      (process as { exit: (c?: number) => never }).exit = (c?: number) => {
        exitCalled = true;
        origExit(c);
      };
      try {
        compileMain([specPath, '--out', outPath]);
      } finally {
        (process as { exit: (c?: number) => never }).exit = origExit;
      }
      assert.ok(!exitCalled, 'main should not exit on success');

      const data = JSON.parse(fs.readFileSync(outPath, 'utf8')) as Record<string, unknown>;
      assert.equal(data['id'], 'demo');
      assert.equal(data['schemaVersion'], '1.0.0');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
