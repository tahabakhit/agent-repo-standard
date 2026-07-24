/**
 * Faithful TypeScript port of test_guards.py.
 *
 * All tests operate entirely inside fs.mkdtemp() temp directories.
 * No files outside the temp dir are touched.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  _isTestFile,
  detectPlaceholders,
  detectTestTampering,
  snapshotTests,
} from '../src/guards.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContract(scope: string[], exclusions: string[] = []): { scope: string[]; exclusions: string[]; checks: unknown[] } {
  return { scope, exclusions, checks: [] };
}

function writeFile(root: string, rel: string, content: string): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

// ---------------------------------------------------------------------------
// snapshotTests
// ---------------------------------------------------------------------------

describe('snapshotTests', () => {
  function withRoot(fn: (r: string) => void): void {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'amanar-snap-'));
    try { fn(r); } finally { fs.rmSync(r, { recursive: true, force: true }); }
  }

  it('captures test file in scope', () => withRoot(r => {
    writeFile(r, 'test_foo.py', 'assert True\n');
    const snap = snapshotTests(r, makeContract(['test_foo.py']));
    assert.ok('test_foo.py' in snap);
    assert.equal(typeof snap['test_foo.py'], 'string');
    assert.equal(snap['test_foo.py'].length, 64); // sha256 hex
  }));

  it('ignores non-test files', () => withRoot(r => {
    writeFile(r, 'main.py', 'x = 1\n');
    const snap = snapshotTests(r, makeContract(['main.py']));
    assert.deepEqual(snap, {});
  }));

  it('captures test files inside scoped directory', () => withRoot(r => {
    writeFile(r, 'src/test_core.py', 'assert 1\n');
    writeFile(r, 'src/utils.py', 'def f(): pass\n');
    const snap = snapshotTests(r, makeContract(['src']));
    assert.ok('src/test_core.py' in snap);
    assert.ok(!('src/utils.py' in snap));
  }));

  it('captures file under tests directory', () => withRoot(r => {
    writeFile(r, 'tests/check.py', 'assert True\n');
    const snap = snapshotTests(r, makeContract(['tests']));
    assert.ok('tests/check.py' in snap);
  }));

  it('out-of-scope test file not captured', () => withRoot(r => {
    writeFile(r, 'test_other.py', 'assert True\n');
    writeFile(r, 'work.txt', 'content\n');
    const snap = snapshotTests(r, makeContract(['work.txt']));
    assert.deepEqual(snap, {});
  }));

  it('empty scope yields empty snapshot', () => withRoot(r => {
    writeFile(r, 'test_foo.py', 'assert True\n');
    const snap = snapshotTests(r, makeContract([]));
    assert.deepEqual(snap, {});
  }));
});

// ---------------------------------------------------------------------------
// detectTestTampering
// ---------------------------------------------------------------------------

describe('detectTestTampering', () => {
  let tmp = '';
  let root = '';

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amanar-guards-tamper-'));
    root = tmp;
  });

  after(async () => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function setupTestFile(rel: string, content: string): string {
    return writeFile(root, rel, content);
  }

  it('clean — no offenders', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amanar-tamper-clean-'));
    try {
      writeFile(tmpRoot, 'tests/test_a.py', 'assert True\n');
      const contract = makeContract(['tests']);
      const baseline = snapshotTests(tmpRoot, contract);
      const offenders = detectTestTampering(tmpRoot, contract, baseline);
      assert.deepEqual(offenders, []);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('modified test file is flagged', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amanar-tamper-mod-'));
    try {
      const filePath = writeFile(tmpRoot, 'tests/test_a.py', 'assert True\n');
      const contract = makeContract(['tests']);
      const baseline = snapshotTests(tmpRoot, contract);
      fs.writeFileSync(filePath, '# emptied by agent\n');
      const offenders = detectTestTampering(tmpRoot, contract, baseline);
      assert.ok(offenders.includes('tests/test_a.py'));
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('deleted test file is flagged', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amanar-tamper-del-'));
    try {
      const filePath = writeFile(tmpRoot, 'tests/test_a.py', 'assert True\n');
      const contract = makeContract(['tests']);
      const baseline = snapshotTests(tmpRoot, contract);
      fs.unlinkSync(filePath);
      const offenders = detectTestTampering(tmpRoot, contract, baseline);
      assert.ok(offenders.includes('tests/test_a.py'));
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('unmodified file not flagged', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amanar-tamper-unmods-'));
    try {
      writeFile(tmpRoot, 'tests/test_a.py', 'assert True\n');
      writeFile(tmpRoot, 'tests/test_b.py', 'assert False is False\n');
      const contract = makeContract(['tests']);
      const baseline = snapshotTests(tmpRoot, contract);
      fs.writeFileSync(path.join(tmpRoot, 'tests', 'test_b.py'), '# weakened\n');
      const offenders = detectTestTampering(tmpRoot, contract, baseline);
      assert.ok(offenders.includes('tests/test_b.py'));
      assert.ok(!offenders.includes('tests/test_a.py'));
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('empty baseline never flags', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amanar-tamper-empty-'));
    try {
      writeFile(tmpRoot, 'work.txt', 'content\n');
      const contract = makeContract(['work.txt']);
      const baseline = snapshotTests(tmpRoot, contract);
      assert.deepEqual(baseline, {});
      const offenders = detectTestTampering(tmpRoot, contract, baseline);
      assert.deepEqual(offenders, []);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('new test file added is not flagged', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amanar-tamper-new-'));
    try {
      writeFile(tmpRoot, 'tests/test_a.py', 'assert True\n');
      const contract = makeContract(['tests']);
      const baseline = snapshotTests(tmpRoot, contract);
      // agent adds a second test file
      writeFile(tmpRoot, 'tests/test_new.py', 'assert True\n');
      const offenders = detectTestTampering(tmpRoot, contract, baseline);
      assert.deepEqual(offenders, []);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('result is sorted', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amanar-tamper-sort-'));
    try {
      writeFile(tmpRoot, 'tests/test_z.py', 'a\n');
      writeFile(tmpRoot, 'tests/test_a.py', 'b\n');
      const contract = makeContract(['tests']);
      const baseline = snapshotTests(tmpRoot, contract);
      fs.writeFileSync(path.join(tmpRoot, 'tests', 'test_z.py'), 'changed\n');
      fs.writeFileSync(path.join(tmpRoot, 'tests', 'test_a.py'), 'changed\n');
      const offenders = detectTestTampering(tmpRoot, contract, baseline);
      assert.deepEqual(offenders, [...offenders].sort());
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// detectPlaceholders
// ---------------------------------------------------------------------------

describe('detectPlaceholders', () => {
  let tmp = '';
  let root = '';

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amanar-guards-ph-'));
    root = tmp;
  });

  after(async () => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function withRoot(fn: (r: string) => void): void {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'amanar-ph-'));
    try { fn(r); } finally { fs.rmSync(r, { recursive: true, force: true }); }
  }

  function contract(r: string, scope = ['src']): { scope: string[]; exclusions: string[]; checks: unknown[] } {
    return makeContract(scope);
  }

  it('clean file — no offenders', () => withRoot(r => {
    writeFile(r, 'src/impl.py', 'def add(a, b):\n    return a + b\n');
    assert.deepEqual(detectPlaceholders(r, contract(r)), []);
  }));

  it('raise NotImplementedError detected', () => withRoot(r => {
    writeFile(r, 'src/impl.py', 'def run():\n    raise NotImplementedError\n');
    const markers = detectPlaceholders(r, contract(r)).map(([, m]) => m);
    assert.ok(markers.includes('raise NotImplementedError'));
  }));

  it('TODO detected', () => withRoot(r => {
    writeFile(r, 'src/impl.py', '# TODO: implement this\nx = 1\n');
    const markers = detectPlaceholders(r, contract(r)).map(([, m]) => m);
    assert.ok(markers.includes('TODO'));
  }));

  it('FIXME detected', () => withRoot(r => {
    writeFile(r, 'src/impl.py', '# FIXME: broken logic\n');
    const markers = detectPlaceholders(r, contract(r)).map(([, m]) => m);
    assert.ok(markers.includes('FIXME'));
  }));

  it('bare pass detected', () => withRoot(r => {
    writeFile(r, 'src/impl.py', 'def run():\n    pass\n');
    const markers = detectPlaceholders(r, contract(r)).map(([, m]) => m);
    assert.ok(markers.includes('pass'));
  }));

  it('pass with comment detected', () => withRoot(r => {
    writeFile(r, 'src/impl.py', 'def run():\n    pass  # placeholder\n');
    const markers = detectPlaceholders(r, contract(r)).map(([, m]) => m);
    assert.ok(markers.includes('pass'));
  }));

  it('standalone ellipsis detected', () => withRoot(r => {
    writeFile(r, 'src/impl.py', 'def run():\n    ...\n');
    const markers = detectPlaceholders(r, contract(r)).map(([, m]) => m);
    assert.ok(markers.includes('...'));
  }));

  it('ellipsis with comment detected', () => withRoot(r => {
    writeFile(r, 'src/impl.py', 'def run():\n    ...  # stub\n');
    const markers = detectPlaceholders(r, contract(r)).map(([, m]) => m);
    assert.ok(markers.includes('...'));
  }));

  it('test files are excluded', () => withRoot(r => {
    writeFile(r, 'src/test_impl.py', 'def test_thing():\n    raise NotImplementedError\n');
    assert.deepEqual(detectPlaceholders(r, contract(r)), []);
  }));

  it('tests directory files excluded', () => withRoot(r => {
    writeFile(r, 'tests/test_check.py', 'def test_x():\n    ...\n');
    assert.deepEqual(detectPlaceholders(r, makeContract(['tests'])), []);
  }));

  it('.amanar directory excluded', () => withRoot(r => {
    const amanarDir = path.join(r, '.amanar');
    fs.mkdirSync(amanarDir, { recursive: true });
    fs.writeFileSync(path.join(amanarDir, 'config.py'), '# TODO internal\n');
    assert.deepEqual(detectPlaceholders(r, makeContract(['.amanar'])), []);
  }));

  it('out-of-scope file ignored', () => withRoot(r => {
    writeFile(r, 'other/impl.py', 'raise NotImplementedError\n');
    assert.deepEqual(detectPlaceholders(r, contract(r)), []);
  }));

  it('returns path and marker', () => withRoot(r => {
    writeFile(r, 'src/impl.py', 'raise NotImplementedError\n');
    const result = detectPlaceholders(r, contract(r));
    assert.equal(result.length, 1);
    const [p, m] = result[0];
    assert.ok(p.includes('impl.py'));
    assert.equal(m, 'raise NotImplementedError');
  }));

  it('at most one entry per file', () => withRoot(r => {
    writeFile(r, 'src/impl.py', '# TODO: fix\nraise NotImplementedError\n');
    const result = detectPlaceholders(r, contract(r));
    const paths = result.map(([p]) => p);
    assert.equal(paths.length, new Set(paths).size); // no duplicate paths
  }));

  it('multiple files each flagged', () => withRoot(r => {
    writeFile(r, 'src/a.py', 'raise NotImplementedError\n');
    writeFile(r, 'src/b.py', '# TODO\n');
    const result = detectPlaceholders(r, contract(r));
    const paths = new Set(result.map(([p]) => p));
    assert.ok(paths.has('src/a.py'));
    assert.ok(paths.has('src/b.py'));
  }));

  it('ellipsis in slice not flagged', () => withRoot(r => {
    writeFile(r, 'src/impl.py', 'x = arr[..., 0]\n');
    assert.deepEqual(detectPlaceholders(r, contract(r)), []);
  }));

  it('pass in middle of code still flagged', () => withRoot(r => {
    writeFile(r, 'src/impl.py', 'def f():\n    x = 1\n    pass\n    return x\n');
    const markers = detectPlaceholders(r, contract(r)).map(([, m]) => m);
    assert.ok(markers.includes('pass'));
  }));
});

// ---------------------------------------------------------------------------
// detectPlaceholders — allowedMarkers parameter
// ---------------------------------------------------------------------------

describe('detectPlaceholders allowedMarkers', () => {
  function withRoot(fn: (r: string) => void): void {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'amanar-allow-'));
    try { fn(r); } finally { fs.rmSync(r, { recursive: true, force: true }); }
  }

  function contract(): { scope: string[]; exclusions: string[]; checks: unknown[] } {
    return makeContract(['src']);
  }

  it('strict default blocks TODO', () => withRoot(r => {
    writeFile(r, 'src/impl.py', '# TODO: implement me\n');
    const result = detectPlaceholders(r, contract());
    const markers = result.map(([, m]) => m);
    assert.ok(markers.includes('TODO'));
  }));

  it('explicit empty set blocks TODO', () => withRoot(r => {
    writeFile(r, 'src/impl.py', '# TODO: implement me\n');
    const result = detectPlaceholders(r, contract(), new Set());
    const markers = result.map(([, m]) => m);
    assert.ok(markers.includes('TODO'));
  }));

  it('allow todo passes TODO, blocks NotImplementedError', () => withRoot(r => {
    writeFile(r, 'src/todo_only.py', '# TODO: later\n');
    writeFile(r, 'src/ni_only.py', 'raise NotImplementedError\n');
    const result = detectPlaceholders(r, contract(), new Set(['todo']));
    const paths = new Set(result.map(([p]) => p));
    const markers = result.map(([, m]) => m);
    assert.ok(!paths.has('src/todo_only.py'));
    assert.ok(markers.includes('raise NotImplementedError'));
  }));

  it('allow todo mixed file still blocks NotImplementedError', () => withRoot(r => {
    writeFile(r, 'src/impl.py', '# TODO: polish later\nraise NotImplementedError\n');
    const result = detectPlaceholders(r, contract(), new Set(['todo']));
    const markers = result.map(([, m]) => m);
    assert.ok(markers.includes('raise NotImplementedError'));
  }));

  it('allow all markers clears fully annotated file', () => withRoot(r => {
    writeFile(r, 'src/impl.py',
      '# TODO: finish\n# FIXME: broken\ndef run():\n    raise NotImplementedError\ndef stub():\n    pass\ndef proto():\n    ...\n',
    );
    const allKeys = new Set(['notimplemented', 'todo', 'fixme', 'pass', 'ellipsis']);
    const result = detectPlaceholders(r, contract(), allKeys);
    assert.deepEqual(result, []);
  }));

  it('allow fixme does not suppress TODO', () => withRoot(r => {
    writeFile(r, 'src/impl.py', '# FIXME: ok\n# TODO: not ok\n');
    const result = detectPlaceholders(r, contract(), new Set(['fixme']));
    const markers = result.map(([, m]) => m);
    assert.ok(markers.includes('TODO'));
    assert.ok(!markers.includes('FIXME'));
  }));

  it('test files excluded regardless of allowedMarkers', () => withRoot(r => {
    writeFile(r, 'src/test_impl.py', 'raise NotImplementedError\n');
    const result = detectPlaceholders(r, contract(), new Set());
    assert.deepEqual(result, []);
  }));
});

// ---------------------------------------------------------------------------
// _isTestFile (internal helper)
// ---------------------------------------------------------------------------

describe('_isTestFile', () => {
  it('test_ underscore prefix', () => {
    assert.ok(_isTestFile('test_foo.py'));
  });

  it('underscore test suffix', () => {
    assert.ok(_isTestFile('foo_test.py'));
  });

  it('dot test extension', () => {
    assert.ok(_isTestFile('foo.test.js'));
  });

  it('inside tests dir', () => {
    assert.ok(_isTestFile('tests/check.py'));
    assert.ok(_isTestFile('src/tests/check.py'));
  });

  it('ordinary file', () => {
    assert.ok(!_isTestFile('main.py'));
    assert.ok(!_isTestFile('src/utils.py'));
  });
});
