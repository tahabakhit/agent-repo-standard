/**
 * Store management: manifest, _index.md, log.md, link checking, dedup/archive.
 */

import fs from "node:fs";
import path from "node:path";
import {
  parseFrontmatter,
  serializeFrontmatter,
  splitEntryText,
} from "./frontmatter.ts";
import type { FmDict } from "./frontmatter.ts";

const STORE_CONFIG_NAME = ".kb";
const MD_LINK_RE = /\[(?:[^\]]*)\]\(([^)]+)\)/g;

// ---------------------------------------------------------------------------
// Entry read/write
// ---------------------------------------------------------------------------

export function readEntry(filePath: string): [FmDict, string] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const [fmText, body] = splitEntryText(raw);
  return [parseFrontmatter(fmText), body];
}

export function writeEntry(filePath: string, fm: FmDict, body: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content =
    serializeFrontmatter(fm) + "\n\n" + body.replace(/^\n+/, "");
  fs.writeFileSync(filePath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export interface ManifestEntry {
  id: string;
  type: string | null;
  title: string | null;
  status: string | null;
  tags: string[];
  path: string;
  created: string | null;
  last_verified: string | null;
  ttl: string | null;
}

export interface Manifest {
  entries: ManifestEntry[];
}

export function loadManifest(store: string): Manifest {
  const manifestPath = path.join(store, "manifest.json");
  if (!fs.existsSync(manifestPath)) return { entries: [] };
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Manifest;
  } catch {
    return { entries: [] };
  }
}

export function saveManifest(store: string, manifest: Manifest): void {
  fs.writeFileSync(
    path.join(store, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
  );
}

export function rebuildManifest(store: string): Manifest {
  const entries: ManifestEntry[] = [];
  const mdFiles = findMdFiles(store);
  for (const mdFile of mdFiles) {
    const rel = path.relative(store, mdFile);
    const parts = rel.split(path.sep);
    if (parts[0] === STORE_CONFIG_NAME) continue;
    if (
      path.basename(mdFile) === "log.md" ||
      path.basename(mdFile).startsWith("_")
    )
      continue;
    let fm: FmDict;
    try {
      [fm] = readEntry(mdFile);
    } catch {
      continue;
    }
    if (!fm["id"]) continue;
    const tagsVal = fm["tags"];
    const tags: string[] = Array.isArray(tagsVal)
      ? (tagsVal as string[])
      : [];
    entries.push({
      id: String(fm["id"]),
      type: fm["type"] != null ? String(fm["type"]) : null,
      title: fm["title"] != null ? String(fm["title"]) : null,
      status: fm["status"] != null ? String(fm["status"]) : null,
      tags,
      path: rel.split(path.sep).join("/"),
      created: fm["created"] != null ? String(fm["created"]) : null,
      last_verified:
        fm["last_verified"] != null ? String(fm["last_verified"]) : null,
      ttl: fm["ttl"] != null ? String(fm["ttl"]) : null,
    });
  }
  const manifest: Manifest = { entries };
  saveManifest(store, manifest);
  return manifest;
}

// ---------------------------------------------------------------------------
// _index.md
// ---------------------------------------------------------------------------

export function updateIndex(
  _store: string,
  subdir: string,
  _entryId: string,
  title: string,
  filename: string,
): void {
  const indexPath = path.join(subdir, "_index.md");
  const link = `- [${title}](${filename})`;

  if (fs.existsSync(indexPath)) {
    const existing = fs.readFileSync(indexPath, "utf-8");
    const lines = existing.split("\n");
    const newLines: string[] = [];
    let found = false;
    for (const line of lines) {
      if (line.includes(`](${filename})`)) {
        newLines.push(link);
        found = true;
      } else {
        newLines.push(line);
      }
    }
    if (!found) newLines.push(link);
    fs.writeFileSync(indexPath, newLines.join("\n") + "\n", "utf-8");
  } else {
    const heading = `# ${path.basename(subdir).charAt(0).toUpperCase() + path.basename(subdir).slice(1)} index\n\n`;
    fs.writeFileSync(indexPath, heading + link + "\n", "utf-8");
  }
}

// ---------------------------------------------------------------------------
// Link checker
// ---------------------------------------------------------------------------

export function checkLinks(body: string, baseDir: string): string[] {
  const broken: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(MD_LINK_RE.source, "g");
  while ((m = re.exec(body)) !== null) {
    const href = m[1];
    if (
      href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("mailto:") ||
      href.startsWith("#")
    )
      continue;
    const target = path.resolve(baseDir, href);
    if (!fs.existsSync(target)) {
      broken.push(href);
    }
  }
  return broken;
}

// ---------------------------------------------------------------------------
// Dedup: archive-with-pointer
// ---------------------------------------------------------------------------

export function findDuplicates(
  manifest: Manifest,
  title: string,
  tags: string[],
): ManifestEntry[] {
  const candidates: ManifestEntry[] = [];
  const titleLower = title.toLowerCase().trim();
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  for (const entry of manifest.entries ?? []) {
    if (entry.status === "archive") continue;
    const existingTitle = (entry.title ?? "").toLowerCase().trim();
    const existingTags = new Set((entry.tags ?? []).map((t: string) => t.toLowerCase()));
    const titleMatch = existingTitle === titleLower;
    const tagOverlap =
      tagSet.size > 0 && existingTags.size > 0
        ? [...tagSet].some((t) => existingTags.has(t))
        : false;
    if (titleMatch || tagOverlap) candidates.push(entry);
  }
  return candidates;
}

export function archiveEntry(
  store: string,
  entryMeta: ManifestEntry,
  pointerId: string,
): void {
  const entryPath = path.join(store, entryMeta.path.split("/").join(path.sep));
  if (!fs.existsSync(entryPath)) return;
  const [fm, body] = readEntry(entryPath);
  fm["status"] = "archive";
  const pointerNote = `\n\n<!-- superseded by entry id:${pointerId} -->\n`;
  writeEntry(entryPath, fm, body + pointerNote);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findMdFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(d: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile() && e.name.endsWith(".md")) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}
