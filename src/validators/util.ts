import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Extract the YAML frontmatter block (between the first pair of `---`
 * delimiters). Returns "" when absent — mirrors the Python/mjs validators.
 */
export function parseFrontmatter(text: string): string {
  if (text.startsWith("---")) {
    const second = text.indexOf("---", 3);
    if (second !== -1) return text.slice(3, second);
  }
  return "";
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Recursively collect files matching `filter`, pruning directory names in `prune`. */
export function walkFiles(
  dir: string,
  filter: (path: string) => boolean,
  prune: Set<string> = new Set(),
  out: string[] = [],
): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (prune.has(entry.name)) continue;
      walkFiles(p, filter, prune, out);
    } else if (entry.isFile() && filter(p)) {
      out.push(p);
    }
  }
  return out;
}
