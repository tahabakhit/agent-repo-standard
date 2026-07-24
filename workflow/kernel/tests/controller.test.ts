/**
 * Faithful TypeScript port of test_controller.py.
 * All 22 test cases preserved. The TS CLI (amanar-workflow.ts) is invoked
 * via node subprocess; check commands remain Python (they are just shell
 * commands the kernel runs).
 */

import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, '..', 'amanar-workflow.ts');

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

interface CtlResult {
  returncode: number;
  stdout: string;
  stderr: string;
}

let root = '';

function ctl(...args: string[]): CtlResult {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: root,
    encoding: 'utf8',
    // PYTHONDONTWRITEBYTECODE prevents __pycache__ creation in check subprocesses
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  return {
    returncode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function gitInit(contract?: Record<string, unknown>): Record<string, unknown> {
  const c = contract ?? baseContract();
  fs.writeFileSync(path.join(root, '.amanar', 'workflow.json'), JSON.stringify(c));
  for (const cmd of [
    ['git', 'init', '-q'],
    ['git', 'config', 'user.email', 'fixture@example.invalid'],
    ['git', 'config', 'user.name', 'Fixture'],
    ['git', 'add', '-A'],
    ['git', 'commit', '-qm', 'fixture'],
  ]) {
    const r = spawnSync(cmd[0], cmd.slice(1), { cwd: root, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`${cmd.join(' ')} failed: ${r.stderr}`);
  }
  return c;
}

function beginAndCheck(): void {
  const begin = ctl('begin');
  assert.equal(begin.returncode, 0, `begin failed: ${begin.stderr}`);
  const run = ctl('run-check', 'tests');
  assert.equal(run.returncode, 0, `run-check failed: ${run.stdout + run.stderr}`);
}

describe('Controller', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ctl-test-'));
    fs.mkdirSync(path.join(root, '.amanar'));
    fs.mkdirSync(path.join(root, 'tests'));
    fs.writeFileSync(
      path.join(root, 'tests', 'test_ok.py'),
      'import unittest\nclass T(unittest.TestCase):\n    def test_ok(self): self.assertTrue(True)\n',
    );
    fs.writeFileSync(path.join(root, 'src.txt'), 'source\n');
    fs.writeFileSync(path.join(root, 'result.txt'), 'result\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('happy path and receipt bindings', () => {
    gitInit();
    assert.equal(ctl('validate').returncode, 0);
    beginAndCheck();
    const verified = ctl('verify');
    assert.equal(verified.returncode, 0, verified.stderr);
    assert.ok(verified.stdout.includes('AMANAR_VERIFIED'));
    const receipt = JSON.parse(
      fs.readFileSync(path.join(root, '.amanar/run/receipts/tests.json'), 'utf8'),
    ) as Record<string, unknown>;
    for (const key of [
      'workflowHash', 'checkDefinitionHash', 'sourceDigest', 'command',
      'exitCode', 'discoveredTests', 'recordedAt', 'stdoutSha256', 'stderrSha256',
    ]) {
      assert.ok(key in receipt, `receipt should have ${key}`);
    }
    const status = ctl('status', '--json');
    assert.equal(
      (JSON.parse(status.stdout) as Record<string, unknown>)['status'],
      'verified',
    );
  });

  test('missing receipt is incomplete evidence', () => {
    gitInit();
    assert.equal(ctl('begin').returncode, 0);
    const r = ctl('verify');
    assert.equal(r.returncode, 5);
    assert.ok(r.stderr.includes('missing receipt'));
  });

  test('repository write authority is enforced', () => {
    const contract = baseContract();
    (contract['authority'] as Record<string, unknown>)['repositoryWrites'] = false;
    gitInit(contract);
    const r = ctl('begin');
    assert.equal(r.returncode, 3);
    assert.ok(!fs.existsSync(path.join(root, '.amanar/run')));
  });

  test('live effect authority rejects before execution', () => {
    const contract = baseContract();
    Object.assign((contract['checks'] as Record<string, unknown>[])[0], {
      command: 'touch LIVE_EFFECT_RAN',
      minTests: 0,
      testParser: 'none',
      outputContains: [],
      liveEffect: true,
    });
    gitInit(contract);
    assert.equal(ctl('begin').returncode, 0);
    const r = ctl('run-check', 'tests');
    assert.equal(r.returncode, 3);
    assert.ok(!fs.existsSync(path.join(root, 'LIVE_EFFECT_RAN')));
  });

  test('zero discovered tests fail closed', () => {
    const contract = baseContract();
    (contract['checks'] as Record<string, unknown>[])[0]['command'] = 'python3 -c "print(\'OK\')"';
    gitInit(contract);
    assert.equal(ctl('begin').returncode, 0);
    const r = ctl('run-check', 'tests');
    assert.equal(r.returncode, 4);
    assert.ok(r.stdout.includes('tests=unparsed'));
  });

  test('source change stales receipt', () => {
    gitInit();
    beginAndCheck();
    fs.writeFileSync(path.join(root, 'src.txt'), 'changed\n');
    const r = ctl('verify');
    assert.equal(r.returncode, 5);
    assert.ok(r.stderr.includes('stale sourceDigest'));
  });

  test('changed check stales runtime contract', () => {
    const contract = gitInit();
    beginAndCheck();
    (contract['checks'] as Record<string, unknown>[])[0]['timeoutSeconds'] = 9;
    fs.writeFileSync(
      path.join(root, '.amanar', 'workflow.json'),
      JSON.stringify(contract),
    );
    const r = ctl('verify');
    assert.equal(r.returncode, 5);
    assert.ok(r.stderr.includes('contract changed'));
  });

  test('tampered check hash is rejected', () => {
    gitInit();
    beginAndCheck();
    const receiptPath = path.join(root, '.amanar/run/receipts/tests.json');
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as Record<string, unknown>;
    receipt['checkDefinitionHash'] = '0'.repeat(64);
    fs.writeFileSync(receiptPath, JSON.stringify(receipt));
    const r = ctl('verify');
    assert.equal(r.returncode, 5);
    assert.ok(r.stderr.includes('checkDefinitionHash'));
  });

  test('incomplete receipt shape is rejected', () => {
    gitInit();
    beginAndCheck();
    const receiptPath = path.join(root, '.amanar/run/receipts/tests.json');
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as Record<string, unknown>;
    delete receipt['stdoutSha256'];
    fs.writeFileSync(receiptPath, JSON.stringify(receipt));
    const r = ctl('verify');
    assert.equal(r.returncode, 5);
    assert.ok(r.stderr.includes('fields are invalid'));
  });

  test('missing controller output rejects plausible receipt', () => {
    gitInit();
    beginAndCheck();
    fs.unlinkSync(path.join(root, '.amanar/run/output/tests.stdout'));
    fs.unlinkSync(path.join(root, '.amanar/run/output/tests.stderr'));
    const r = ctl('verify');
    assert.equal(r.returncode, 5);
    assert.ok(r.stderr.includes('stored output'));
  });

  test('tampered controller output rejects receipt', () => {
    gitInit();
    beginAndCheck();
    fs.writeFileSync(path.join(root, '.amanar/run/output/tests.stdout'), 'forged\n');
    const r = ctl('verify');
    assert.equal(r.returncode, 5);
    assert.ok(r.stderr.includes('stdout digest'));
  });

  test('out of scope change is rejected before check', () => {
    gitInit();
    assert.equal(ctl('begin').returncode, 0);
    fs.writeFileSync(path.join(root, 'outside.txt'), 'not allowed\n');
    const r = ctl('run-check', 'tests');
    assert.equal(r.returncode, 5);
    assert.ok(r.stderr.includes('out-of-scope'));
  });

  test('check created out of scope file is rejected', () => {
    const contract = baseContract();
    Object.assign((contract['checks'] as Record<string, unknown>[])[0], {
      command: 'touch outside.txt',
      minTests: 0,
      testParser: 'none',
      outputContains: [],
    });
    gitInit(contract);
    assert.equal(ctl('begin').returncode, 0);
    const r = ctl('run-check', 'tests');
    assert.equal(r.returncode, 5);
    assert.ok(r.stderr.includes('out-of-scope'));
  });

  test('check created ignored out of scope file is rejected', () => {
    fs.writeFileSync(path.join(root, '.gitignore'), 'ignored.tmp\n');
    const contract = baseContract();
    Object.assign((contract['checks'] as Record<string, unknown>[])[0], {
      command: 'touch ignored.tmp',
      minTests: 0,
      testParser: 'none',
      outputContains: [],
    });
    gitInit(contract);
    assert.equal(ctl('begin').returncode, 0);
    const r = ctl('run-check', 'tests');
    assert.equal(r.returncode, 5);
    assert.ok(r.stderr.includes('out-of-scope'));
  });

  test('excluded change is rejected', () => {
    const contract = baseContract();
    contract['scope'] = ['src/', 'result.txt'];
    contract['exclusions'] = ['src/vendor/'];
    fs.mkdirSync(path.join(root, 'src', 'vendor'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'vendor', 'file.txt'), 'original\n');
    gitInit(contract);
    assert.equal(ctl('begin').returncode, 0);
    fs.writeFileSync(path.join(root, 'src', 'vendor', 'file.txt'), 'changed\n');
    const r = ctl('run-check', 'tests');
    assert.equal(r.returncode, 5);
    assert.ok(r.stderr.includes('excluded path'));
  });

  test('missing artifact is rejected at verify', () => {
    gitInit();
    beginAndCheck();
    fs.unlinkSync(path.join(root, 'result.txt'));
    const r = ctl('verify');
    assert.equal(r.returncode, 5);
    assert.ok(r.stderr.includes('artifacts missing'));
  });

  test('timeout kills process group and child sentinel', async () => {
    const script = path.join(root, 'timeout_parent.py');
    fs.writeFileSync(
      script,
      // Exact equivalent of the Python test's script content
      `import subprocess, sys, time\n` +
      `subprocess.Popen([sys.executable, '-c', "import time; time.sleep(0.5); open('sentinel','w').write('bad')"])\n` +
      `time.sleep(5)\n`,
    );
    const contract = baseContract();
    Object.assign((contract['checks'] as Record<string, unknown>[])[0], {
      command: 'python3 timeout_parent.py',
      timeoutSeconds: 0.1,
      minTests: 0,
      testParser: 'none',
      outputContains: [],
    });
    gitInit(contract);
    assert.equal(ctl('begin').returncode, 0);
    const r = ctl('run-check', 'tests');
    assert.equal(r.returncode, 4);
    assert.ok(r.stderr.includes('timed out'));
    // Wait for child's sleep to expire (0.5s) + margin
    await new Promise(resolve => setTimeout(resolve, 700));
    assert.ok(!fs.existsSync(path.join(root, 'sentinel')), 'sentinel should not exist');
  });

  test('timeout kills detached child sentinel', async () => {
    const script = path.join(root, 'timeout_detached.py');
    fs.writeFileSync(
      script,
      `import subprocess, sys, time\n` +
      `subprocess.Popen([sys.executable, '-c', "import time; time.sleep(0.5); open('detached-sentinel','w').write('bad')"], start_new_session=True)\n` +
      `time.sleep(5)\n`,
    );
    const contract = baseContract();
    Object.assign((contract['checks'] as Record<string, unknown>[])[0], {
      command: 'python3 timeout_detached.py',
      timeoutSeconds: 0.1,
      minTests: 0,
      testParser: 'none',
      outputContains: [],
    });
    gitInit(contract);
    assert.equal(ctl('begin').returncode, 0);
    const r = ctl('run-check', 'tests');
    assert.equal(r.returncode, 4);
    // Wait for child's sleep to expire (0.5s) + margin
    await new Promise(resolve => setTimeout(resolve, 700));
    assert.ok(
      !fs.existsSync(path.join(root, 'detached-sentinel')),
      'detached-sentinel should not exist',
    );
  });

  test('block and resume are explicit', () => {
    gitInit();
    assert.equal(ctl('begin').returncode, 0);
    assert.equal(ctl('block', '--reason', 'dependency unavailable').returncode, 0);
    assert.equal(ctl('run-check', 'tests').returncode, 6);
    const resumed = ctl('begin');
    assert.equal(resumed.returncode, 0);
    assert.ok(resumed.stdout.includes('blocked -> implementing'));
  });

  test('unknown check and duplicate begin are incomplete', () => {
    gitInit();
    assert.equal(ctl('begin').returncode, 0);
    assert.equal(ctl('run-check', 'missing').returncode, 6);
    assert.equal(ctl('begin').returncode, 6);
  });

  test('verified is derived when source later changes', () => {
    gitInit();
    beginAndCheck();
    assert.equal(ctl('verify').returncode, 0);
    fs.writeFileSync(path.join(root, 'src.txt'), 'later\n');
    const status = ctl('status', '--json');
    const record = JSON.parse(status.stdout) as Record<string, unknown>;
    assert.equal(record['recordedStatus'], 'verified');
    assert.equal(record['status'], 'implementing');
    assert.equal(record['current'], false);
  });

  test('head change after begin is rejected', () => {
    gitInit();
    assert.equal(ctl('begin').returncode, 0);
    fs.writeFileSync(path.join(root, 'src.txt'), 'committed change\n');
    spawnSync('git', ['add', 'src.txt'], { cwd: root });
    spawnSync('git', ['commit', '-qm', 'change head'], { cwd: root });
    const r = ctl('run-check', 'tests');
    assert.equal(r.returncode, 5);
    assert.ok(r.stderr.includes('HEAD changed'));
  });
});
