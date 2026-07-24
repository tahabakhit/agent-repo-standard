/**
 * Source snapshots and receipt freshness checks.
 * Mirrors amanar_workflow/receipts.py exactly.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkHash, pathIn, workflowHash } from './contract.ts';
import { EvidenceError, WorkflowError } from './errors.ts';
import { MAX_OUTPUT, parseTests } from './execution.ts';

export const RUNTIME_PREFIX = '.amanar/run/';

function git(root: string, ...args: string[]): Buffer {
  const result = spawnSync('git', args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const message = (result.stderr as Buffer).toString('utf8', 0).trim();
    throw new WorkflowError(`Git source inspection failed: ${message}`);
  }
  return result.stdout as Buffer;
}

function fileDigest(filePath: string): string {
  const lstat = fs.lstatSync(filePath);
  if (lstat.isSymbolicLink()) {
    const h = crypto.createHash('sha256');
    h.update('symlink\0', 'utf8');
    // readlink with buffer gives raw bytes, matching Python's os.readlink(...).encode(errors="surrogateescape")
    const linkTarget = fs.readlinkSync(filePath, { encoding: 'buffer' });
    h.update(linkTarget);
    return h.digest('hex');
  }
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function _fileDigest(filePath: string): string {
  return fileDigest(filePath);
}

function entryDigest(filePath: string): string {
  const stat = fs.lstatSync(filePath);
  if (stat.isDirectory()) return 'directory';
  if (stat.isFile() || stat.isSymbolicLink()) return fileDigest(filePath);
  const ifmt = stat.mode & 0o170000;
  return `special:${ifmt.toString(8)}`;
}

function filesystemEntries(root: string): Record<string, string> {
  const files: Record<string, string> = {};

  function visit(directory: string, prefix: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (e) {
      throw new WorkflowError(`filesystem source inspection failed: ${e}`);
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (name === '.git' || name.startsWith('.git/')) continue;
      if (name === '.amanar/run' || name.startsWith(RUNTIME_PREFIX)) continue;

      const entryPath = path.join(directory, entry.name);
      // isDirectory() on Dirent does NOT follow symlinks
      if (entry.isDirectory()) {
        visit(entryPath, name);
      } else {
        files[name] = entryDigest(entryPath);
      }
    }
  }

  visit(root, '');
  return files;
}

/**
 * Stable JSON with sorted keys (no spaces) — matches Python's default json.dumps
 * used for snapshot encoding (ensure_ascii=True behavior for non-ASCII chars).
 */
function snapshotJson(value: unknown): string {
  function encode(v: unknown): string {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return JSON.stringify(v);
    if (typeof v === 'string') {
      // Escape non-ASCII characters like Python's ensure_ascii=True
      return JSON.stringify(v).replace(/[^\x00-\x7F]/gu, c => {
        const cp = c.codePointAt(0)!;
        if (cp <= 0xffff) return `\\u${cp.toString(16).padStart(4, '0')}`;
        // Surrogate pair for code points > 0xffff
        const hi = Math.floor((cp - 0x10000) / 0x400) + 0xd800;
        const lo = ((cp - 0x10000) % 0x400) + 0xdc00;
        return `\\u${hi.toString(16).padStart(4, '0')}\\u${lo.toString(16).padStart(4, '0')}`;
      });
    }
    if (Array.isArray(v)) return '[' + v.map(encode).join(',') + ']';
    if (typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      return '{' + keys.map(k => encode(k) + ':' + encode(obj[k])).join(',') + '}';
    }
    return JSON.stringify(v);
  }
  return encode(value);
}

export function sourceSnapshot(root: string): Record<string, unknown> {
  const head = git(root, 'rev-parse', 'HEAD').toString('utf8').trim();
  const namesRaw = git(root, 'ls-files', '-z', '--cached');
  const files = filesystemEntries(root);

  // namesRaw is null-terminated list of tracked file paths
  const names = namesRaw.toString('utf8').split('\0');
  for (const name of names) {
    if (!name) continue;
    if (name === '.amanar/run' || name.startsWith(RUNTIME_PREFIX)) continue;
    if (!(name in files)) {
      files[name] = 'missing';
    }
  }

  const payload: Record<string, unknown> = { head, files };
  const encoded = Buffer.from(snapshotJson(payload), 'utf8');
  payload['digest'] = crypto.createHash('sha256').update(encoded).digest('hex');
  return payload;
}

export function changedPaths(
  baseline: Record<string, unknown>,
  current: Record<string, unknown>,
): string[] {
  const before = baseline['files'] as Record<string, string>;
  const after = current['files'] as Record<string, string>;
  const allPaths = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...allPaths].filter(p => before[p] !== after[p]).sort();
}

export function assertScope(
  contract: Record<string, unknown>,
  baseline: Record<string, unknown>,
  current: Record<string, unknown>,
): void {
  if (baseline['head'] !== current['head']) {
    throw new EvidenceError('source HEAD changed since begin');
  }
  for (const filePath of changedPaths(baseline, current)) {
    if ((contract['exclusions'] as string[]).some(item => pathIn(filePath, item))) {
      throw new EvidenceError(`excluded path changed: ${filePath}`);
    }
    if (!(contract['scope'] as string[]).some(item => pathIn(filePath, item))) {
      throw new EvidenceError(`out-of-scope path changed: ${filePath}`);
    }
  }
}

export function assertArtifacts(root: string, contract: Record<string, unknown>): void {
  const missing = (contract['artifacts'] as string[]).filter(
    p => !fs.existsSync(path.join(root, p.replace(/\/$/, ''))),
  );
  if (missing.length > 0) {
    throw new EvidenceError(`declared artifacts missing: ${missing.join(', ')}`);
  }
}

const HEX64 = /^[0-9a-f]{64}$/;

export function receiptProblem(
  receipt: Record<string, unknown>,
  contract: Record<string, unknown>,
  check: Record<string, unknown>,
  sourceDigest: string,
): string | null {
  const required = new Set([
    'receiptVersion', 'workflowId', 'workflowHash', 'checkId', 'checkDefinitionHash',
    'sourceDigest', 'command', 'exitCode', 'discoveredTests', 'stdoutSha256',
    'stderrSha256', 'stdoutTruncated', 'stderrTruncated', 'timedOut', 'passed',
    'recordedAt',
  ]);
  if (
    new Set(Object.keys(receipt)).size !== required.size ||
    !Object.keys(receipt).every(k => required.has(k))
  ) {
    return `${check['id']} receipt fields are invalid`;
  }

  if (receipt['receiptVersion'] !== '1.0.0' || receipt['workflowId'] !== contract['id']) {
    return `${check['id']} receipt identity is invalid`;
  }

  for (const field of ['workflowHash', 'checkDefinitionHash', 'sourceDigest', 'stdoutSha256', 'stderrSha256']) {
    if (!HEX64.test(String(receipt[field] ?? ''))) {
      return `${check['id']} receipt digest is invalid`;
    }
  }

  const discoveredRaw = receipt['discoveredTests'];
  if (typeof discoveredRaw !== 'number' && discoveredRaw !== null) {
    return `${check['id']} receipt test count is invalid`;
  }

  for (const field of ['stdoutTruncated', 'stderrTruncated', 'timedOut', 'passed']) {
    if (typeof receipt[field] !== 'boolean') {
      return `${check['id']} receipt boolean is invalid`;
    }
  }

  try {
    const d = new Date(receipt['recordedAt'] as string);
    if (isNaN(d.getTime())) throw new Error('invalid');
  } catch {
    return `${check['id']} receipt timestamp is invalid`;
  }

  const expected: Record<string, unknown> = {
    workflowHash: workflowHash(contract),
    checkDefinitionHash: checkHash(check),
    checkId: check['id'],
    command: check['command'],
    sourceDigest,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (receipt[key] !== value) {
      return `${check['id']} receipt has stale ${key}`;
    }
  }

  if (receipt['passed'] !== true) {
    return `${check['id']} receipt did not pass`;
  }
  if (receipt['exitCode'] !== check['expectedExit']) {
    return `${check['id']} receipt exit code is stale`;
  }

  const discovered = receipt['discoveredTests'] as number | null;
  if (discovered === null || discovered < (check['minTests'] as number)) {
    return `${check['id']} receipt test count is insufficient`;
  }

  return null;
}

export function outputProblem(
  receipt: Record<string, unknown>,
  check: Record<string, unknown>,
  outputDir: string,
): string | null {
  const streams: Record<string, Buffer> = {};
  for (const stream of ['stdout', 'stderr'] as const) {
    const filePath = path.join(outputDir, `${check['id']}.${stream}`);
    try {
      const stat = fs.lstatSync(filePath);
      if (!stat.isFile() || stat.size > MAX_OUTPUT) {
        throw new Error('not a bounded regular file');
      }
      streams[stream] = fs.readFileSync(filePath);
    } catch {
      return `${check['id']} stored output is missing or invalid`;
    }
    const actual = crypto.createHash('sha256').update(streams[stream]).digest('hex');
    if (receipt[`${stream}Sha256`] !== actual) {
      return `${check['id']} ${stream} digest does not match stored output`;
    }
  }

  const combined = streams['stdout'].toString('utf8') + '\n' + streams['stderr'].toString('utf8');
  const discovered = parseTests(check['testParser'] as string, combined);

  if (discovered !== receipt['discoveredTests']) {
    return `${check['id']} stored output test count does not match receipt`;
  }
  if (!(check['outputContains'] as string[]).every(token => combined.includes(token))) {
    return `${check['id']} stored output lacks required tokens`;
  }

  const passed =
    receipt['timedOut'] === false &&
    receipt['exitCode'] === check['expectedExit'] &&
    discovered !== null &&
    (discovered as number) >= (check['minTests'] as number);

  if (receipt['passed'] !== passed) {
    return `${check['id']} receipt outcome does not match stored output`;
  }

  return null;
}
