/**
 * Pure loading and validation for workflow schema 1.0.0.
 * Mirrors amanar_workflow/contract.py exactly.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import { ContractError } from './errors.ts';

export const TOP_FIELDS = new Set([
  'schemaVersion', 'id', 'objective', 'scope', 'exclusions', 'artifacts',
  'authority', 'checks',
]);
const AUTHORITY_FIELDS = new Set(['repositoryWrites', 'liveEffects']);
const CHECK_FIELDS = new Set([
  'id', 'command', 'expectedExit', 'outputContains', 'timeoutSeconds',
  'minTests', 'testParser', 'liveEffect',
]);
const PARSERS = new Set(['none', 'unittest', 'pytest', 'tap']);
const IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Canonical JSON bytes — sort_keys=True, no spaces, ensure_ascii=False equivalent. */
export function canonicalJson(value: unknown): Buffer {
  return Buffer.from(stableStringify(value), 'utf8');
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function digest(value: unknown): string {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function exactFields(
  value: Record<string, unknown>,
  expected: Set<string>,
  label: string,
): void {
  const keys = new Set(Object.keys(value));
  const missing = [...expected].filter(k => !keys.has(k)).sort();
  const unknown = [...keys].filter(k => !expected.has(k)).sort();
  if (missing.length > 0) {
    throw new ContractError(`${label} missing fields: ${missing.join(', ')}`);
  }
  if (unknown.length > 0) {
    throw new ContractError(`${label} has unknown fields: ${unknown.join(', ')}`);
  }
}

/**
 * Validate and return a normalized repository-relative path.
 * Mirrors Python's _path() exactly, including PurePosixPath normalization semantics.
 */
function validatePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new ContractError(`${label} must be a non-empty normalized path`);
  }
  const directory = value.endsWith('/');
  const raw = directory ? value.slice(0, -1) : value;

  // Absolute path check
  if (raw.startsWith('/')) {
    throw new ContractError(`${label} must be repository-relative without '..'`);
  }
  // Empty or lone-dot check
  if (raw === '' || raw === '.') {
    throw new ContractError(`${label} must be repository-relative without '..'`);
  }
  // Check for .. segments
  const segments = raw.split('/');
  if (segments.includes('..')) {
    throw new ContractError(`${label} must be repository-relative without '..'`);
  }
  // Normalization check: simulate str(PurePosixPath(raw)) == raw
  // PurePosixPath collapses empty segments (from //) and single-dot segments
  // but does NOT collapse .. segments.
  const normalized = segments.filter(s => s !== '' && s !== '.').join('/');
  if (normalized !== raw) {
    throw new ContractError(`${label} must be a normalized safe path`);
  }
  // First segment must not be .git
  if (segments[0] === '.git') {
    throw new ContractError(`${label} must be a normalized safe path`);
  }
  // Must not be .amanar/run
  if (segments.length >= 2 && segments[0] === '.amanar' && segments[1] === 'run') {
    throw new ContractError(`${label} cannot include controller runtime state`);
  }

  return raw + (directory ? '/' : '');
}

export function pathIn(filePath: string, declared: string): boolean {
  const prefix = declared.endsWith('/') ? declared.slice(0, -1) : declared;
  return filePath === prefix || (declared.endsWith('/') && filePath.startsWith(prefix + '/'));
}

export function validate(data: unknown): Record<string, unknown> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ContractError('workflow contract must be a JSON object');
  }
  const obj = data as Record<string, unknown>;
  exactFields(obj, TOP_FIELDS, 'workflow contract');

  if (obj['schemaVersion'] !== '1.0.0') {
    throw new ContractError(`unsupported schemaVersion: ${JSON.stringify(obj['schemaVersion'])}`);
  }
  if (typeof obj['id'] !== 'string' || !IDENTIFIER.test(obj['id'])) {
    throw new ContractError('workflow id must be kebab-case');
  }
  if (typeof obj['objective'] !== 'string' || !obj['objective'].trim()) {
    throw new ContractError('objective must be a non-empty string');
  }

  const normalized: Record<string, string[]> = {};
  for (const field of ['scope', 'exclusions', 'artifacts'] as const) {
    const values = obj[field];
    if (!Array.isArray(values) || (field === 'scope' && values.length === 0)) {
      throw new ContractError(
        `${field} must be ${field === 'scope' ? 'a non-empty ' : 'an '}array`,
      );
    }
    const parsed = (values as unknown[]).map(item => validatePath(item, `${field} item`));
    if (parsed.length !== new Set(parsed).size) {
      throw new ContractError(`${field} contains duplicate paths`);
    }
    normalized[field] = parsed;
  }
  for (const artifact of normalized['artifacts']) {
    const plain = artifact.replace(/\/$/, '');
    if (!normalized['scope'].some(item => pathIn(plain, item))) {
      throw new ContractError(`artifact is outside scope: ${artifact}`);
    }
    if (normalized['exclusions'].some(item => pathIn(plain, item))) {
      throw new ContractError(`artifact is excluded: ${artifact}`);
    }
  }

  const authority = obj['authority'];
  if (typeof authority !== 'object' || authority === null || Array.isArray(authority)) {
    throw new ContractError('authority must be an object');
  }
  const auth = authority as Record<string, unknown>;
  exactFields(auth, AUTHORITY_FIELDS, 'authority');
  for (const key of AUTHORITY_FIELDS) {
    if (typeof auth[key] !== 'boolean') {
      throw new ContractError('authority values must be booleans');
    }
  }

  const checks = obj['checks'];
  if (!Array.isArray(checks) || checks.length === 0) {
    throw new ContractError('checks must be a non-empty array');
  }
  const checkIds: string[] = [];
  for (let index = 0; index < checks.length; index++) {
    const check = checks[index];
    const label = `check ${index}`;
    if (typeof check !== 'object' || check === null || Array.isArray(check)) {
      throw new ContractError(`${label} must be an object`);
    }
    const c = check as Record<string, unknown>;
    exactFields(c, CHECK_FIELDS, label);

    if (typeof c['id'] !== 'string' || !IDENTIFIER.test(c['id'])) {
      throw new ContractError(`${label} id must be kebab-case`);
    }
    checkIds.push(c['id'] as string);

    if (typeof c['command'] !== 'string' || !c['command'].trim()) {
      throw new ContractError(`check ${c['id']} command must be non-empty`);
    }
    if (typeof c['expectedExit'] !== 'number' || !Number.isInteger(c['expectedExit']) ||
        c['expectedExit'] < 0 || c['expectedExit'] > 255) {
      throw new ContractError(`check ${c['id']} expectedExit must be 0..255`);
    }
    const tokens = c['outputContains'];
    if (!Array.isArray(tokens) ||
        tokens.some((t: unknown) => typeof t !== 'string' || !t) ||
        tokens.length !== new Set(tokens).size) {
      throw new ContractError(
        `check ${c['id']} outputContains must contain unique non-empty strings`,
      );
    }
    const timeout = c['timeoutSeconds'];
    if (typeof timeout !== 'number' || timeout <= 0 || timeout > 3600) {
      throw new ContractError(`check ${c['id']} timeoutSeconds must be within 0..3600`);
    }
    if (typeof c['minTests'] !== 'number' || !Number.isInteger(c['minTests']) || c['minTests'] < 0) {
      throw new ContractError(`check ${c['id']} minTests cannot be negative`);
    }
    if (!PARSERS.has(c['testParser'] as string)) {
      throw new ContractError(`check ${c['id']} has unsupported testParser`);
    }
    if ((c['minTests'] as number) > 0 && c['testParser'] === 'none') {
      throw new ContractError(`check ${c['id']} needs a test parser when minTests > 0`);
    }
    if (typeof c['liveEffect'] !== 'boolean') {
      throw new ContractError(`check ${c['id']} liveEffect must be boolean`);
    }
  }
  if (checkIds.length !== new Set(checkIds).size) {
    throw new ContractError('checks require unique ids');
  }

  return obj;
}

export function load(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new ContractError(`workflow contract missing: ${filePath}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    throw new ContractError(`cannot read workflow contract: ${e}`);
  }
  return validate(data);
}

export function checkHash(check: Record<string, unknown>): string {
  return digest(check);
}

export function workflowHash(contract: Record<string, unknown>): string {
  return digest(contract);
}
