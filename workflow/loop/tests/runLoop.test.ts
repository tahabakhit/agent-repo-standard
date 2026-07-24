/**
 * Faithful TypeScript port of test_run_loop.py.
 *
 * The kernel is vendored into a temp .amanar/kernel/ directory.
 * A fake agent is injected instead of calling a real host.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { controller, loop, passesK, status } from '../src/runLoop.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KERNEL = path.join(__dirname, '..', '..', 'kernel');

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

const DONE_CHECK = {
  id: 'done',
  command: "python3 -c \"import pathlib,sys; sys.exit(0 if 'DONE' in pathlib.Path('work.txt').read_text() else 1)\"",
  expectedExit: 0,
  outputContains: [] as string[],
  timeoutSeconds: 10,
  minTests: 0,
  testParser: 'none',
  liveEffect: false,
};

function baseContract(check?: typeof DONE_CHECK | Record<string, unknown>): Record<string, unknown> {
  return {
    schemaVersion: '1.0.0',
    id: 'loop-fixture',
    objective: 'write DONE to work.txt',
    scope: ['work.txt'],
    exclusions: [],
    artifacts: ['work.txt'],
    authority: { repositoryWrites: true, liveEffects: false },
    checks: [check ?? DONE_CHECK],
  };
}

function baseContractWithTests(check?: Record<string, unknown>): Record<string, unknown> {
  return { ...baseContract(check), scope: ['work.txt', 'tests/'] };
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Vendor the kernel into root/.amanar/kernel and initialise a git repo.
 */
function vendor(root: string, contract?: Record<string, unknown>): void {
  const control = path.join(root, '.amanar');
  fs.mkdirSync(control, { recursive: true });
  fs.writeFileSync(
    path.join(control, 'workflow.json'),
    JSON.stringify(contract ?? baseContract()),
  );
  const kernel = path.join(control, 'kernel');
  fs.mkdirSync(kernel, { recursive: true });
  // Copy kernel files
  fs.copyFileSync(path.join(KERNEL, 'VERSION'), path.join(kernel, 'VERSION'));
  fs.copyFileSync(
    path.join(KERNEL, 'amanar-workflow.ts'),
    path.join(kernel, 'amanar-workflow.ts'),
  );
  copyDir(path.join(KERNEL, 'src'), path.join(kernel, 'src'));
  copyDir(path.join(KERNEL, 'schema'), path.join(kernel, 'schema'));
  fs.writeFileSync(path.join(root, '.gitignore'), '.amanar/run/\n__pycache__/\n');
  for (const cmd of [
    ['git', 'init', '-q'],
    ['git', 'config', 'user.email', 'loop@example.invalid'],
    ['git', 'config', 'user.name', 'Loop'],
    ['git', 'add', '-A'],
    ['git', 'commit', '-qm', 'fixture'],
  ]) {
    const r = spawnSync(cmd[0], cmd.slice(1), { cwd: root, encoding: 'utf8' });
    if (r.status !== 0) {
      throw new Error(`${cmd.join(' ')} failed: ${r.stderr}`);
    }
  }
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

type AgentFn = (host: string, root: string, prompt: string, model: string, effort: string, timeout: number) => [number | null, string];

function runLoop(
  root: string,
  agent: AgentFn,
  contract?: Record<string, unknown>,
  maxIterations = 4,
  passK = 1,
): ReturnType<typeof loop> {
  return loop(root, 'pi', 'model', 'low', maxIterations, passK, 30, agent);
}

// ---------------------------------------------------------------------------
// RunLoopTestCase
// ---------------------------------------------------------------------------

describe('RunLoop', () => {
  let tmp = '';
  let root = '';

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amanar-loop-'));
    root = tmp;
    fs.writeFileSync(path.join(root, 'work.txt'), 'PENDING\n');
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('runner verifies after one fix', () => {
    vendor(root);
    const agent: AgentFn = () => {
      fs.writeFileSync(path.join(root, 'work.txt'), 'DONE\n');
      return [0, 'fixed'];
    };
    const result = runLoop(root, agent);
    assert.equal(result.outcome, 'verified');
    assert.equal(result.iterations, 1);
    assert.equal(status(root)['status'], 'verified');
  });

  it('noop agent exhausts bound', () => {
    vendor(root);
    const result = runLoop(root, () => [0, 'noop'], undefined, 3);
    assert.equal(result.outcome, 'exhausted');
    assert.equal(result.iterations, 3);
  });

  it('retry converges on later iteration', () => {
    vendor(root);
    let calls = 0;
    const agent: AgentFn = () => {
      calls++;
      if (calls >= 2) {
        fs.writeFileSync(path.join(root, 'work.txt'), 'DONE\n');
      }
      return [0, 'step'];
    };
    const result = runLoop(root, agent);
    assert.equal(result.outcome, 'verified');
    assert.equal(result.iterations, 2);
  });

  it('runner recovers a spurious block', () => {
    vendor(root);
    const agent: AgentFn = () => {
      fs.writeFileSync(path.join(root, 'work.txt'), 'DONE\n');
      controller(root, 'begin');
      controller(root, 'block', '--reason', 'waiting on authority');
      return [0, 'blocked'];
    };
    const result = runLoop(root, agent);
    assert.equal(result.outcome, 'verified');
  });

  it('live effect without authority stops', () => {
    const live = { ...DONE_CHECK, command: 'true', liveEffect: true };
    vendor(root, baseContract(live));
    const result = runLoop(root, () => [0, 'noop']);
    assert.equal(result.outcome, 'authority-required');
  });

  it('pass_k requires repeated success', () => {
    vendor(root);
    const agent: AgentFn = () => {
      fs.writeFileSync(path.join(root, 'work.txt'), 'DONE\n');
      return [0, 'fixed'];
    };
    const result = runLoop(root, agent, undefined, 4, 3);
    assert.equal(result.outcome, 'verified');
    fs.writeFileSync(path.join(root, 'work.txt'), 'PENDING\n');
    assert.ok(!passesK(root, baseContract(), 1));
  });
});

// ---------------------------------------------------------------------------
// GuardIntegrationCase
// ---------------------------------------------------------------------------

describe('GuardIntegration', () => {
  let tmp = '';
  let root = '';

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amanar-guard-int-'));
    root = tmp;
    fs.writeFileSync(path.join(root, 'work.txt'), 'PENDING\n');
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function vendorWithTestFile(testContent = 'assert True\n', contract?: Record<string, unknown>): void {
    const testsDir = path.join(root, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });
    fs.writeFileSync(path.join(testsDir, 'test_core.py'), testContent);
    vendor(root, contract ?? baseContractWithTests());
  }

  function runLoopG(
    agent: AgentFn,
    contract?: Record<string, unknown>,
    maxIterations = 4,
    passK = 1,
  ): ReturnType<typeof loop> {
    return loop(root, 'pi', 'model', 'low', maxIterations, passK, 30, agent);
  }

  it('tampered test file outcome is not verified', () => {
    vendorWithTestFile();
    const agent: AgentFn = () => {
      fs.writeFileSync(path.join(root, 'work.txt'), 'DONE\n');
      fs.writeFileSync(path.join(root, 'tests', 'test_core.py'), '# emptied\n');
      return [0, 'done'];
    };
    const result = runLoopG(agent, baseContractWithTests());
    assert.notEqual(result.outcome, 'verified');
    assert.equal(result.outcome, 'test-tampering');
  });

  it('deleted test file outcome is not verified', () => {
    vendorWithTestFile();
    const agent: AgentFn = () => {
      fs.writeFileSync(path.join(root, 'work.txt'), 'DONE\n');
      const target = path.join(root, 'tests', 'test_core.py');
      if (fs.existsSync(target)) fs.unlinkSync(target);
      return [0, 'done'];
    };
    const result = runLoopG(agent, baseContractWithTests());
    assert.notEqual(result.outcome, 'verified');
    assert.equal(result.outcome, 'test-tampering');
  });

  it('tampered test failing info feeds next prompt', () => {
    vendorWithTestFile();
    const prompts: string[] = [];
    let calls = 0;
    const agent: AgentFn = (_host, _root, prompt) => {
      prompts.push(prompt);
      calls++;
      if (calls === 1) {
        // First iteration: tamper with the test
        fs.writeFileSync(path.join(root, 'tests', 'test_core.py'), '# removed\n');
      } else {
        // Second iteration: restore test and fix work.txt
        fs.writeFileSync(path.join(root, 'tests', 'test_core.py'), 'assert True\n');
        fs.writeFileSync(path.join(root, 'work.txt'), 'DONE\n');
      }
      return [0, 'ok'];
    };
    const result = runLoopG(agent, baseContractWithTests(), 4);
    // Second prompt must mention the tampering
    assert.ok(prompts.length > 1);
    assert.ok(prompts[1].includes('Test files modified or deleted'));
    assert.equal(result.outcome, 'verified');
  });

  it('placeholder code prevents verified', () => {
    vendor(root);
    const agent: AgentFn = () => {
      // Would satisfy the DONE check but leaves a placeholder
      fs.writeFileSync(path.join(root, 'work.txt'), 'DONE\nraise NotImplementedError\n');
      return [0, 'done'];
    };
    const result = runLoopG(agent);
    assert.notEqual(result.outcome, 'verified');
    assert.equal(result.outcome, 'placeholder-detected');
  });

  it('TODO in scope file prevents verified', () => {
    vendor(root);
    const agent: AgentFn = () => {
      fs.writeFileSync(path.join(root, 'work.txt'), 'DONE\n# TODO: finish this\n');
      return [0, 'done'];
    };
    const result = runLoopG(agent);
    assert.notEqual(result.outcome, 'verified');
    assert.equal(result.outcome, 'placeholder-detected');
  });

  it('placeholder fixed eventually verifies', () => {
    vendor(root);
    let calls = 0;
    const agent: AgentFn = () => {
      calls++;
      if (calls === 1) {
        // First attempt: placeholder left in scope file
        fs.writeFileSync(path.join(root, 'work.txt'), 'DONE\nraise NotImplementedError\n');
      } else {
        // Second attempt: clean implementation
        fs.writeFileSync(path.join(root, 'work.txt'), 'DONE\n');
      }
      return [0, 'step'];
    };
    const result = runLoopG(agent, undefined, 4);
    assert.equal(result.outcome, 'verified');
    assert.equal(result.iterations, 2);
  });

  it('tamper then fix then verify', () => {
    vendorWithTestFile();
    let calls = 0;
    const agent: AgentFn = () => {
      calls++;
      if (calls === 1) {
        // First attempt: tamper
        fs.writeFileSync(path.join(root, 'tests', 'test_core.py'), '# broken\n');
        fs.writeFileSync(path.join(root, 'work.txt'), 'DONE\n');
      } else {
        // Second attempt: restore test and keep fix
        fs.writeFileSync(path.join(root, 'tests', 'test_core.py'), 'assert True\n');
        fs.writeFileSync(path.join(root, 'work.txt'), 'DONE\n');
      }
      return [0, 'ok'];
    };
    const result = runLoopG(agent, baseContractWithTests(), 4);
    assert.equal(result.outcome, 'verified');
  });

  it('legitimate implementation passes guards', () => {
    vendor(root);
    const agent: AgentFn = () => {
      fs.writeFileSync(path.join(root, 'work.txt'), 'DONE\n');
      return [0, 'clean'];
    };
    const result = runLoopG(agent);
    assert.equal(result.outcome, 'verified');
    assert.equal(result.iterations, 1);
  });

  it('guards do not false positive on clean state', () => {
    vendor(root);
    // work.txt starts as "PENDING\n" — no placeholder markers
    const result = runLoopG(() => [0, 'noop'], undefined, 3);
    // Outcome is 'exhausted' (checks fail), NOT a guard outcome
    assert.equal(result.outcome, 'exhausted');
    assert.equal(result.iterations, 3);
  });
});
