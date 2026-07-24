import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { walkFiles } from "./util.ts";

// Directory names never scanned (mirrors validate-components.py SKIP_DIRS).
const SKIP_DIRS = new Set([".git", "node_modules", ".venv", "dist", "__pycache__"]);

// Estate-specific identifiers that must never appear in the portable, public
// kit. Assembled from fragments so this validator's own source is not a match.
const ESTATE_IDENTIFIERS = ["NAS" + "RID"];

/**
 * Port of tests/validate-components.py — assert no estate identifier leaks into
 * the portable kit. `identifierSources` are files that legitimately name the
 * identifier (this validator, plus the Python validator during the parity
 * window) and are skipped.
 */
export function validateComponents(repoRoot: string, identifierSources: string[]): string {
  const skip = new Set(identifierSources.map((f) => resolve(f)));
  const files = walkFiles(repoRoot, () => true, SKIP_DIRS);

  for (const path of files) {
    if (path.endsWith(".pyc") || path.endsWith(".pyo")) continue;
    if (skip.has(resolve(path))) continue;
    const rel = relative(repoRoot, path);
    // Defensive: walkFiles already prunes SKIP_DIRS, but guard nested parts too.
    if (rel.split(sep).some((part) => SKIP_DIRS.has(part))) continue;
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    for (const identifier of ESTATE_IDENTIFIERS) {
      if (text.includes(identifier)) {
        throw new Error(`estate-specific identifier '${identifier}' found: ${rel}`);
      }
    }
  }

  return "PASS: component boundaries valid";
}
