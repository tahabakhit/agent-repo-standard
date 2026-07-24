/**
 * Faithful TypeScript port of test_execution.py.
 * All 4 test cases preserved.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseTests } from '../src/execution.ts';

describe('Test parser', () => {
  test('unittest', () => {
    assert.equal(parseTests('unittest', 'Ran 12 tests in 0.1s'), 12);
  });

  test('pytest', () => {
    assert.equal(parseTests('pytest', '12 passed, 1 warning in 0.2s'), 12);
  });

  test('tap', () => {
    assert.equal(parseTests('tap', 'TAP version 13\nok 1\n1..1\n'), 1);
  });

  test('missing discovery is not zero', () => {
    assert.equal(parseTests('unittest', 'OK'), null);
    assert.equal(parseTests('none', 'anything'), 0);
  });
});
