/**
 * Faithful TypeScript port of test_render_handoff.py.
 * All 5 test cases preserved.
 */

import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { render } from '../src/tools/renderHandoff.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, '..', 'amanar-workflow.ts');

function baseContract(): Record<string, unknown> {
  return {
    schemaVersion: '1.0.0',
    id: 'handoff-fixture',
    objective: 'Exercise the handoff digest',
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

function initialize(contract?: Record<string, unknown>): Record<string, unknown> {
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

describe('Render handoff', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-handoff-test-'));
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

  test('planned lists begin first', () => {
    initialize();
    const digest = render(root);
    assert.ok(digest.includes('State: **planned**'));
    assert.ok(digest.includes('`tests`: **MISSING**'));
    assert.ok(digest.includes('1. `begin`'));
    assert.ok(digest.includes('`verify`'));
  });

  test('implementing lists remaining check', () => {
    initialize();
    assert.equal(ctl('begin').returncode, 0);
    const digest = render(root);
    assert.ok(digest.includes('State: **implementing**'));
    assert.ok(digest.includes('`run-check tests`'));
    assert.ok(!digest.includes('1. `begin`'));
  });

  test('verified reports no action', () => {
    initialize();
    assert.equal(ctl('begin').returncode, 0);
    assert.equal(ctl('run-check', 'tests').returncode, 0);
    assert.equal(ctl('verify').returncode, 0);
    const digest = render(root);
    assert.ok(digest.includes('State: **verified**'));
    assert.ok(digest.includes('`tests`: **CURRENT**'));
    assert.ok(digest.includes('No action needed'));
  });

  test('source change downgrades and stales', () => {
    initialize();
    assert.equal(ctl('begin').returncode, 0);
    assert.equal(ctl('run-check', 'tests').returncode, 0);
    assert.equal(ctl('verify').returncode, 0);
    fs.writeFileSync(path.join(root, 'src.txt'), 'changed\n');
    const digest = render(root);
    assert.ok(digest.includes('State: **implementing** (recorded verified)'));
    assert.ok(digest.includes('`tests`: **STALE**'));
    assert.ok(digest.includes('`run-check tests`'));
  });

  test('closet lists artifacts and hash', () => {
    const contract = initialize();
    const digest = render(root);
    assert.ok(digest.includes('`result.txt`'));
    assert.ok(digest.includes(contract['id'] as string));
    assert.ok(digest.includes('Workflow hash:'));
  });
});
