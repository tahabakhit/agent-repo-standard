/**
 * Faithful TypeScript port of test_contract.py.
 * All 11 test cases preserved.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

import { TOP_FIELDS, load, validate } from '../src/contract.ts';
import { ContractError } from '../src/errors.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KERNEL = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures');

function loadValid(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, 'valid', 'basic.json'), 'utf8'));
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

describe('Contract fixture tests', () => {
  test('valid fixtures load with schemaVersion 1.0.0', () => {
    const validDir = path.join(FIXTURES, 'valid');
    const paths = fs.readdirSync(validDir).filter(f => f.endsWith('.json'));
    assert.ok(paths.length >= 1, 'expected at least one valid fixture');
    for (const name of paths) {
      const contract = load(path.join(validDir, name));
      assert.equal(contract['schemaVersion'], '1.0.0', `${name} should have schemaVersion 1.0.0`);
    }
  });

  test('invalid fixtures all raise ContractError', () => {
    const invalidDir = path.join(FIXTURES, 'invalid');
    const paths = fs.readdirSync(invalidDir).filter(f => f.endsWith('.json'));
    assert.ok(paths.length >= 8, `expected at least 8 invalid fixtures, found ${paths.length}`);
    for (const name of paths) {
      assert.throws(
        () => load(path.join(invalidDir, name)),
        ContractError,
        `${name} should raise ContractError`,
      );
    }
  });

  test('schema and controller public fields match', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(KERNEL, 'schema', 'workflow.schema.json'), 'utf8'),
    ) as Record<string, unknown>;
    const schemaRequired = new Set(schema['required'] as string[]);
    assert.deepEqual(schemaRequired, TOP_FIELDS);
    assert.equal(schema['additionalProperties'], false);
  });

  test('schema encodes shared path and parser constraints', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(KERNEL, 'schema', 'workflow.schema.json'), 'utf8'),
    ) as Record<string, unknown>;
    const defs = schema['$defs'] as Record<string, Record<string, unknown>>;
    const pathSchema = defs['repositoryPath'];
    const pattern = new RegExp(pathSchema['pattern'] as string);

    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    for (const field of ['scope', 'exclusions', 'artifacts']) {
      assert.deepEqual(
        (props[field]['items'] as Record<string, unknown>),
        { $ref: '#/$defs/repositoryPath' },
        `${field}.items should reference repositoryPath`,
      );
    }
    for (const value of ['src/file.py', 'src/']) {
      assert.ok(pattern.test(value), `${value} should match`);
    }
    for (const value of ['../outside', '/absolute', '.git/config', '.amanar/run/state.json', 'a//b']) {
      assert.ok(!pattern.test(value), `${value} should not match`);
    }
    const conditional = (props['checks']['items'] as Record<string, unknown>)['allOf'] as unknown[];
    assert.ok(
      conditional.some(entry => {
        const e = entry as Record<string, unknown>;
        const ifClause = e['if'] as Record<string, unknown>;
        const thenClause = e['then'] as Record<string, unknown>;
        const ifProps = ifClause?.['properties'] as Record<string, unknown>;
        const thenProps = thenClause?.['properties'] as Record<string, unknown>;
        const minTests = (ifProps?.['minTests'] as Record<string, unknown>);
        const testParser = (thenProps?.['testParser'] as Record<string, unknown>);
        return minTests?.['minimum'] === 1 && (testParser?.['not'] as Record<string, unknown>)?.['const'] === 'none';
      }),
      'conditional minTests > 0 requires parser != none',
    );
  });

  test('contract documents live effect author trust boundary', () => {
    const text = fs.readFileSync(path.join(KERNEL, 'docs', 'contract.md'), 'utf8').toLowerCase();
    assert.ok(text.includes('contract author'), 'contract.md should mention "contract author"');
    assert.ok(text.includes('does not infer'), 'contract.md should mention "does not infer"');
  });

  test('project local controller has exact version pin', () => {
    const version = fs.readFileSync(path.join(KERNEL, 'VERSION'), 'utf8').trim();
    const pkg = JSON.parse(fs.readFileSync(path.join(KERNEL, 'package.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(version, pkg['version'], 'VERSION must match package.json version');
    const readme = fs.readFileSync(path.join(KERNEL, 'README.md'), 'utf8');
    assert.ok(readme.includes('.amanar/kernel/VERSION'), 'README must reference .amanar/kernel/VERSION');
  });

  test('authority requires real booleans', () => {
    const valid = loadValid();
    for (const value of [0, 1, 'true', null]) {
      const data = deepClone(valid);
      (data['authority'] as Record<string, unknown>)['repositoryWrites'] = value;
      assert.throws(() => validate(data), ContractError, `value ${value} should fail`);
    }
  });

  test('artifact must be in scope and not excluded', () => {
    const valid = loadValid();
    let data = deepClone(valid);
    data['artifacts'] = ['elsewhere.txt'];
    assert.throws(() => validate(data), ContractError, 'out-of-scope artifact');
    data = deepClone(valid);
    data['artifacts'] = ['src/vendor/file.txt'];
    assert.throws(() => validate(data), ContractError, 'excluded artifact');
  });

  test('timeout and exit are bounded', () => {
    const valid = loadValid();
    const cases: Array<[string, unknown]> = [
      ['timeoutSeconds', 0],
      ['timeoutSeconds', 3601],
      ['expectedExit', -1],
      ['expectedExit', 256],
    ];
    for (const [field, value] of cases) {
      const data = deepClone(valid);
      (data['checks'] as Record<string, unknown>[])[0][field] = value;
      assert.throws(() => validate(data), ContractError, `${field}=${value} should fail`);
    }
  });

  test('remaining shape and path invariants', () => {
    const valid = loadValid();
    type Mutator = (data: Record<string, unknown>) => void;
    const cases: Mutator[] = [
      d => { d['id'] = 'Bad Id'; },
      d => { d['objective'] = ' '; },
      d => { d['scope'] = []; },
      d => { d['exclusions'] = 'not-an-array'; },
      d => { d['scope'] = ['x', 'x']; },
      ...([' x', '/x', '.git/config', '.amanar/run/state.json', 'a//b'] as const).map(
        p => ((d: Record<string, unknown>) => { d['scope'] = [p]; }) as Mutator,
      ),
      d => { d['authority'] = []; },
      d => { d['checks'] = []; },
      d => { d['checks'] = ['not-an-object']; },
      d => { (d['checks'] as Record<string, unknown>[])[0]['id'] = 'Bad'; },
      d => { (d['checks'] as Record<string, unknown>[])[0]['outputContains'] = ['']; },
      d => { (d['checks'] as Record<string, unknown>[])[0]['testParser'] = 'unknown'; },
      d => { (d['checks'] as Record<string, unknown>[])[0]['liveEffect'] = 0; },
      d => { (d['checks'] as Record<string, unknown>[])[0]['minTests'] = true; },
      d => { (d['checks'] as Record<string, unknown>[])[0]['timeoutSeconds'] = true; },
      d => { (d['checks'] as Record<string, unknown>[])[0]['expectedExit'] = true; },
    ];
    // Plus a bare array as data itself
    for (let i = 0; i < cases.length; i++) {
      const data = deepClone(valid);
      cases[i](data);
      assert.throws(() => validate(data), ContractError, `case ${i} should fail`);
    }
    assert.throws(() => validate([]), ContractError, 'array as contract should fail');
  });

  test('load rejects missing and malformed JSON', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-contract-test-'));
    try {
      assert.throws(
        () => load(path.join(tmpDir, 'missing.json')),
        ContractError,
        'missing file should throw',
      );
      const bad = path.join(tmpDir, 'bad.json');
      fs.writeFileSync(bad, '{');
      assert.throws(() => load(bad), ContractError, 'malformed JSON should throw');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
