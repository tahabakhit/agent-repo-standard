/**
 * Structural anti-gaming guards for the bounded-loop runner.
 *
 * Two families of check:
 *
 * 1. detectTestTampering — flags test files that were modified or deleted since
 *    the loop started. Call snapshotTests once before the first agent iteration
 *    to capture the baseline; pass the snapshot to detectTestTampering after
 *    each agent run.
 *
 * 2. detectPlaceholders — flags placeholder markers (raise NotImplementedError,
 *    TODO, FIXME, bare pass, standalone ...) found in non-test scope files.
 *    Operates on the current working-tree state after each agent invocation.
 *    Accepts an optional `allowedMarkers` set of stable marker keys; markers
 *    whose key is in that set are skipped. Default (empty set) is strict:
 *    every marker blocks 'verified'.
 *
 * Both functions accept `root` (absolute repo root) and `contract`
 * (object decoded from workflow.json). They are pure: no subprocess calls,
 * no side effects, no network.
 *
 * Stable marker keys (used by `allowedMarkers` and the `--allow-marker` CLI
 * flag):
 *
 *   "notimplemented" — raise NotImplementedError
 *   "todo"           — TODO comment
 *   "fixme"          — FIXME comment
 *   "pass"           — bare pass statement
 *   "ellipsis"       — standalone ... expression
 *
 * Port of workflow/loop/guards.py.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Test-file identification
// ---------------------------------------------------------------------------

// Filename patterns that mark a file as a test file.
// Mirrors Python's fnmatch patterns: test_*.py, *_test.py, *.test.*
const _TEST_NAME_PATTERNS: RegExp[] = [
  /^test_.+/,      // test_*.py
  /.+_test\..+$/,  // *_test.py (any extension)
  /.+\.test\..+$/, // *.test.*
];

/**
 * Return true when `rel` matches a test-file naming convention.
 *
 * Matches on filename glob patterns or on membership inside a directory
 * named `tests`.
 */
export function _isTestFile(rel: string): boolean {
  const name = path.basename(rel);
  for (const pat of _TEST_NAME_PATTERNS) {
    if (pat.test(name)) return true;
  }
  // any file whose path includes a component named 'tests'
  const parts = rel.split(path.sep);
  // also handle forward slash on all platforms
  const allParts = rel.includes('/') ? rel.split('/') : parts;
  return allParts.includes('tests');
}

// ---------------------------------------------------------------------------
// Scope iteration
// ---------------------------------------------------------------------------

type Contract = {
  scope?: string[];
  exclusions?: string[];
  checks?: unknown[];
};

/**
 * Yield every regular file that falls inside the contract scope.
 *
 * Scope entries may be relative file paths or relative directory paths;
 * non-existent entries are silently skipped.
 */
function* _iterScopeFiles(root: string, contract: Contract): Generator<string> {
  for (const entry of contract.scope ?? []) {
    const target = path.join(root, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(target);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      yield* _walkDir(target);
    } else if (stat.isFile()) {
      yield target;
    }
  }
}

function* _walkDir(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* _walkDir(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

// ---------------------------------------------------------------------------
// SHA-256 helper
// ---------------------------------------------------------------------------

function _sha256(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ---------------------------------------------------------------------------
// Guard 1: test-file tampering
// ---------------------------------------------------------------------------

/**
 * Capture `{rel_path: sha256}` for every test file in the contract scope.
 *
 * Call this once **before** the first agent iteration. Pass the returned
 * map to `detectTestTampering` after each agent run.
 */
export function snapshotTests(root: string, contract: Contract): Record<string, string> {
  const result: Record<string, string> = {};
  for (const absPath of _iterScopeFiles(root, contract)) {
    const rel = path.relative(root, absPath);
    // Normalise to forward slashes for cross-platform key consistency.
    const relKey = rel.split(path.sep).join('/');
    if (_isTestFile(relKey)) {
      result[relKey] = _sha256(absPath);
    }
  }
  return result;
}

/**
 * Return relative paths of test files that were modified or deleted.
 *
 * Compares the current working tree against `baseline` (the dict returned by
 * `snapshotTests`). A path is flagged when its SHA-256 changed or the file
 * no longer exists. The `contract` parameter is accepted for API symmetry
 * but is not used during comparison (the baseline already encodes which files
 * were in scope).
 */
export function detectTestTampering(
  root: string,
  _contract: Contract,
  baseline: Record<string, string>,
): string[] {
  const offenders: string[] = [];
  for (const [relStr, originalHash] of Object.entries(baseline)) {
    const current = path.join(root, relStr);
    if (!fs.existsSync(current)) {
      offenders.push(relStr);
    } else if (_sha256(current) !== originalHash) {
      offenders.push(relStr);
    }
  }
  return offenders.sort();
}

// ---------------------------------------------------------------------------
// Guard 2: placeholder code
// ---------------------------------------------------------------------------

const _RAISE_NOT_IMPL_RE = /\braise\s+NotImplementedError\b/;
const _TODO_RE = /\bTODO\b/;
const _FIXME_RE = /\bFIXME\b/;
// bare pass: the stripped line is exactly 'pass' or 'pass # ...'
const _BARE_PASS_RE = /^pass(\s+#.*)?$/;
// standalone ellipsis: the stripped line is exactly '...' or '... # ...'
const _ELLIPSIS_RE = /^\.\.\.\s*(#.*)?$/;

/**
 * Canonical set of stable marker keys accepted by detectPlaceholders and the
 * --allow-marker CLI flag.
 */
export const MARKER_KEYS: ReadonlySet<string> = new Set([
  'notimplemented', 'todo', 'fixme', 'pass', 'ellipsis',
]);

/**
 * Return the label of the first placeholder marker found in `text`.
 *
 * Markers whose stable key appears in `allowedMarkers` are skipped.
 */
function _firstPlaceholder(text: string, allowedMarkers: Set<string> = new Set()): string | null {
  for (const line of text.split('\n')) {
    const stripped = line.trim();
    if (!allowedMarkers.has('notimplemented') && _RAISE_NOT_IMPL_RE.test(stripped)) {
      return 'raise NotImplementedError';
    }
    if (!allowedMarkers.has('todo') && _TODO_RE.test(stripped)) {
      return 'TODO';
    }
    if (!allowedMarkers.has('fixme') && _FIXME_RE.test(stripped)) {
      return 'FIXME';
    }
    if (!allowedMarkers.has('pass') && _BARE_PASS_RE.test(stripped)) {
      return 'pass';
    }
    if (!allowedMarkers.has('ellipsis') && _ELLIPSIS_RE.test(stripped)) {
      return '...';
    }
  }
  return null;
}

/**
 * Return `[[rel_path, marker]]` for placeholder code in scope files.
 *
 * Scans all files inside the contract scope, excluding:
 * - files that match test-file naming patterns
 * - files under `.amanar/`
 *
 * Returns at most one entry per file (the first marker encountered).
 *
 * `allowedMarkers` is an optional set of stable marker keys (see MARKER_KEYS)
 * whose corresponding markers are *not* flagged. Default (null or empty set)
 * is strict: every marker blocks 'verified'.
 */
export function detectPlaceholders(
  root: string,
  contract: Contract,
  allowedMarkers?: Set<string> | null,
): [string, string][] {
  const allowed: Set<string> = allowedMarkers ?? new Set();
  const offenders: [string, string][] = [];
  const amanar = path.join(root, '.amanar');
  for (const absPath of _iterScopeFiles(root, contract)) {
    // exclude .amanar/ internals
    if (absPath.startsWith(amanar + path.sep) || absPath === amanar) {
      continue;
    }
    const rel = path.relative(root, absPath);
    const relKey = rel.split(path.sep).join('/');
    if (_isTestFile(relKey)) {
      continue;
    }
    let text: string;
    try {
      text = fs.readFileSync(absPath, 'utf8');
    } catch {
      continue;
    }
    const marker = _firstPlaceholder(text, allowed);
    if (marker !== null) {
      offenders.push([relKey, marker]);
    }
  }
  return offenders;
}
