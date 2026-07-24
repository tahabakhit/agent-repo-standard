/**
 * Schema validation for entry frontmatter (stdlib-only, no jsonschema).
 * Exact port of kb.py validation logic.
 */

import type { FmDict } from "./frontmatter.ts";

const REQUIRED = new Set(["id", "type", "title", "status"]);
const ENUMS: Record<string, Set<string>> = {
  status: new Set(["active", "reference", "archive"]),
  confidence: new Set(["low", "medium", "high"]),
  provenance: new Set(["agent", "human", "distilled"]),
};
const LIST_FIELDS = new Set(["tags", "sources"]);
const TTL_RE = /^\d+(d|m|y)$/;

export { TTL_RE };

export function validateEntry(fm: FmDict): string[] {
  const errors: string[] = [];

  for (const field of REQUIRED) {
    if (!fm[field]) {
      errors.push(`required field missing or empty: ${JSON.stringify(field)}`);
    }
  }

  for (const [field, allowed] of Object.entries(ENUMS)) {
    const val = fm[field];
    if (val !== undefined && val !== null && !allowed.has(String(val))) {
      const sorted = [...allowed].sort();
      errors.push(
        `${JSON.stringify(field)} must be one of ${JSON.stringify(sorted)}, got ${JSON.stringify(val)}`,
      );
    }
  }

  for (const field of LIST_FIELDS) {
    const val = fm[field];
    if (val !== undefined && val !== null && !Array.isArray(val)) {
      errors.push(`${JSON.stringify(field)} must be a list`);
    }
  }

  const ttl = fm["ttl"];
  if (ttl !== undefined && ttl !== null && !TTL_RE.test(String(ttl))) {
    errors.push(`'ttl' must match <N>(d|m|y), got ${JSON.stringify(ttl)}`);
  }

  return errors;
}

export function parseTtl(ttlStr: string): number {
  const m = TTL_RE.exec(ttlStr.trim());
  if (!m) throw new Error(`invalid TTL: ${JSON.stringify(ttlStr)}`);
  const n = parseInt(ttlStr.slice(0, -1), 10);
  const unit = ttlStr[ttlStr.length - 1];
  if (unit === "d") return n;
  if (unit === "m") return n * 30;
  return n * 365;
}

export function parseIso(s: string): Date {
  const normalized = s.replace("Z", "+00:00");
  const d = new Date(normalized);
  if (!isNaN(d.getTime())) return d;
  // Fallback: strip timezone
  const bare = normalized.split("+")[0].split("-")[0];
  return new Date(bare);
}
