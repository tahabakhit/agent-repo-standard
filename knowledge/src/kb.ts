#!/usr/bin/env node
/**
 * kb — config-driven knowledge-save CLI (Node.js port of kb.py).
 *
 * Verbs: save | validate | stale | doctor
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { die, warn, nowIso } from "./util.ts";
import { resolveStore, readStoreConfig, ensureStore } from "./config.ts";
import { validateEntry, parseTtl, parseIso, TTL_RE } from "./schema.ts";
import { scanSecrets } from "./secrets.ts";
import {
  readEntry,
  writeEntry,
  loadManifest,
  rebuildManifest,
  updateIndex,
  checkLinks,
  findDuplicates,
  archiveEntry,
} from "./store.ts";
import { gitCommitStore, runGitleaksCheck } from "./git.ts";

// ---------------------------------------------------------------------------
// Test seams — mutate properties of these objects in tests.
// Using a plain object so ES module read-only binding restriction is avoided.
// ---------------------------------------------------------------------------

export const kbSeams: {
  stdinContent: string | null;
  runGitleaksCheckOverride: ((store: string) => string[]) | null;
} = {
  stdinContent: null,
  runGitleaksCheckOverride: null,
};

// ---------------------------------------------------------------------------
// CLI arg parser (manual; no third-party deps)
// ---------------------------------------------------------------------------

interface GlobalArgs {
  store: string | null;
  noInteractive: boolean;
  verb: string;
  rest: string[];
}

function parseGlobal(argv: string[]): GlobalArgs {
  let store: string | null = null;
  let noInteractive = false;
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--store" && i + 1 < argv.length) {
      store = argv[++i];
    } else if (a === "--no-interactive") {
      noInteractive = true;
    } else if (!a.startsWith("-")) {
      // First positional is the verb
      return {
        store,
        noInteractive,
        verb: a,
        rest: argv.slice(i + 1),
      };
    }
    i++;
  }
  // No verb found — show usage and error
  process.stderr.write(
    "kb: error: a verb is required: save | validate | stale | doctor\n",
  );
  process.exit(1);
}

interface SaveArgs {
  file: string | null;
  id: string | null;
  type: string;
  title: string;
  description: string | null;
  status: string;
  tags: string;
  ttl: string | null;
  confidence: string | null;
  provenance: string;
  sources: string[];
}

function parseSaveArgs(argv: string[]): SaveArgs {
  const args: SaveArgs = {
    file: null,
    id: null,
    type: "fact",
    title: "",
    description: null,
    status: "active",
    tags: "",
    ttl: null,
    confidence: null,
    provenance: "human",
    sources: [],
  };
  const STATUS_CHOICES = new Set(["active", "reference", "archive"]);
  const CONFIDENCE_CHOICES = new Set(["low", "medium", "high"]);
  const PROVENANCE_CHOICES = new Set(["agent", "human", "distilled"]);

  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    function next(): string {
      if (i + 1 >= argv.length) {
        die(`${a} requires a value`);
      }
      return argv[++i];
    }
    switch (a) {
      case "--file":
      case "-f":
        args.file = next();
        break;
      case "--id":
        args.id = next();
        break;
      case "--type":
        args.type = next();
        break;
      case "--title":
        args.title = next();
        break;
      case "--description":
        args.description = next();
        break;
      case "--status": {
        const v = next();
        if (!STATUS_CHOICES.has(v)) die(`--status must be one of ${[...STATUS_CHOICES].join(", ")}`);
        args.status = v;
        break;
      }
      case "--tags":
        args.tags = next();
        break;
      case "--ttl":
        args.ttl = next();
        break;
      case "--confidence": {
        const v = next();
        if (!CONFIDENCE_CHOICES.has(v)) die(`--confidence must be one of ${[...CONFIDENCE_CHOICES].join(", ")}`);
        args.confidence = v;
        break;
      }
      case "--provenance": {
        const v = next();
        if (!PROVENANCE_CHOICES.has(v)) die(`--provenance must be one of ${[...PROVENANCE_CHOICES].join(", ")}`);
        args.provenance = v;
        break;
      }
      case "--sources": {
        // nargs=* — collect until next flag
        while (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
          args.sources.push(argv[++i]);
        }
        break;
      }
      default:
        // ignore unknown flags
        break;
    }
    i++;
  }

  if (!args.title) {
    die("save: --title is required");
  }
  return args;
}

// ---------------------------------------------------------------------------
// Read stdin (sync)
// ---------------------------------------------------------------------------

function readStdinSync(): string {
  if (kbSeams.stdinContent !== null) return kbSeams.stdinContent;
  try {
    return fs.readFileSync("/dev/stdin", "utf-8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Verb: save
// ---------------------------------------------------------------------------

function cmdSave(globalArgs: GlobalArgs): number {
  const store = resolveStore(globalArgs.store, {
    interactive: !globalArgs.noInteractive,
  });
  ensureStore(store);
  const cfg = readStoreConfig(store);
  const commitPolicy = cfg["commit_policy"] ?? "auto";
  const defaultTtl = cfg["ttl_policy"] ?? "90d";

  const args = parseSaveArgs(globalArgs.rest);

  // Read content
  let content: string;
  if (args.file) {
    content = fs.readFileSync(args.file, "utf-8");
  } else {
    content = readStdinSync();
  }

  if (!content.trim()) {
    die("content is empty; pipe markdown via stdin or supply --file");
  }

  // Step 1: secret scan
  const findings = scanSecrets(content);
  if (findings.length > 0) {
    process.stderr.write("kb: ABORTED — secrets detected in candidate content:\n");
    for (const f of findings) {
      process.stderr.write(`  • ${f}\n`);
    }
    return 1;
  }

  // Build frontmatter
  const entryId = args.id ?? crypto.randomUUID();
  const now = nowIso();
  const tags = (args.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const sources: Record<string, string>[] = [];
  for (const url of args.sources) {
    sources.push({ url, sha256: "", ingested: now });
  }

  const fm: Record<string, unknown> = {
    id: entryId,
    type: args.type || "fact",
    title: args.title || "Untitled",
    status: args.status || "active",
    tags,
    created: now,
    last_verified: now,
    ttl: args.ttl || defaultTtl,
    provenance: args.provenance || "human",
  };
  if (args.description) fm["description"] = args.description;
  if (args.confidence) fm["confidence"] = args.confidence;
  if (sources.length > 0) fm["sources"] = sources;

  // Step 2: schema validate
  const errors = validateEntry(fm as Record<string, import("./frontmatter.ts").FmValue>);
  if (errors.length > 0) {
    process.stderr.write("kb: ABORTED — schema validation failed:\n");
    for (const e of errors) {
      process.stderr.write(`  • ${e}\n`);
    }
    return 1;
  }

  // Step 3: dedup
  const manifest = loadManifest(store);
  const dupes = findDuplicates(manifest, String(fm["title"]), tags);
  for (const dupe of dupes) {
    warn(
      `possible duplicate: ${JSON.stringify(dupe.title)} (id=${dupe.id}) — archiving old entry`,
    );
    archiveEntry(store, dupe, entryId);
  }

  // Step 4: link check
  const entryTypeDir = path.join(store, String(fm["type"]));
  const broken = checkLinks(content, entryTypeDir);
  if (broken.length > 0) {
    warn(`broken relative links in content (not blocking): ${JSON.stringify(broken)}`);
  }

  // Step 5: write entry
  const filename = `${entryId}.md`;
  const entryPath = path.join(entryTypeDir, filename);
  writeEntry(entryPath, fm as Record<string, import("./frontmatter.ts").FmValue>, content);

  // Step 5b: update _index.md
  updateIndex(store, entryTypeDir, entryId, String(fm["title"]), filename);

  // Step 5c: append to log.md
  const logPath = path.join(store, "log.md");
  const logLine = `- ${now}  save  [${fm["title"]}](${fm["type"]}/${filename})  id:${entryId}\n`;
  fs.appendFileSync(logPath, logLine, "utf-8");

  // Step 5d: regenerate manifest.json
  rebuildManifest(store);

  // Step 5e: optional gitleaks defense-in-depth
  const glCheck = kbSeams.runGitleaksCheckOverride ?? runGitleaksCheck;
  const glFindings = glCheck(store);
  if (glFindings.length > 0) {
    process.stderr.write(
      "kb: ABORTED — gitleaks detected secrets; commit suppressed:\n",
    );
    for (const f of glFindings) {
      process.stderr.write(`  • ${f}\n`);
    }
    return 1;
  }

  // Step 6: git commit
  if (commitPolicy === "auto") {
    const msg = `kb: save ${fm["type"]}: ${fm["title"]}`;
    const touched = [
      entryPath,
      path.join(entryTypeDir, "_index.md"),
      logPath,
      path.join(store, "manifest.json"),
    ];
    for (const dupe of dupes) {
      touched.push(path.join(store, ...dupe.path.split("/")));
    }
    gitCommitStore(store, msg, touched);
  }

  process.stdout.write(`kb: saved  ${fm["type"]}/${filename}  id:${entryId}\n`);
  return 0;
}

// ---------------------------------------------------------------------------
// Verb: validate
// ---------------------------------------------------------------------------

function cmdValidate(globalArgs: GlobalArgs): number {
  const store = resolveStore(globalArgs.store, {
    interactive: !globalArgs.noInteractive,
  });
  let errorsFound = false;

  const mdFiles = findMdFilesFiltered(store);
  for (const mdFile of mdFiles) {
    const rel = path.relative(store, mdFile).split(path.sep).join("/");
    let fm: Record<string, import("./frontmatter.ts").FmValue>;
    try {
      [fm] = readEntry(mdFile);
    } catch (exc) {
      process.stdout.write(`PARSE ERROR  ${rel}: ${exc}\n`);
      errorsFound = true;
      continue;
    }
    const errs = validateEntry(fm);
    if (errs.length > 0) {
      errorsFound = true;
      for (const e of errs) {
        process.stdout.write(`INVALID  ${rel}: ${e}\n`);
      }
    } else {
      process.stdout.write(`ok  ${rel}\n`);
    }
  }
  return errorsFound ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Verb: stale
// ---------------------------------------------------------------------------

function cmdStale(globalArgs: GlobalArgs): number {
  const store = resolveStore(globalArgs.store, {
    interactive: !globalArgs.noInteractive,
  });
  const manifest = loadManifest(store);
  const now = new Date();
  let foundAny = false;
  for (const entry of manifest.entries ?? []) {
    const lv = entry.last_verified;
    const ttl = entry.ttl;
    if (!lv || !ttl) continue;
    let lvDt: Date;
    let deltaDays: number;
    try {
      lvDt = parseIso(lv);
      deltaDays = parseTtl(ttl);
    } catch {
      continue;
    }
    const expiresMs = lvDt.getTime() + deltaDays * 86400 * 1000;
    if (expiresMs < now.getTime()) {
      process.stdout.write(
        `STALE  ${entry.path}  title=${JSON.stringify(entry.title)}  last_verified=${lv}  ttl=${ttl}\n`,
      );
      foundAny = true;
    }
  }
  if (!foundAny) {
    process.stdout.write("kb: no stale entries found\n");
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Verb: doctor
// ---------------------------------------------------------------------------

function cmdDoctor(globalArgs: GlobalArgs): number {
  const store = resolveStore(globalArgs.store, {
    interactive: !globalArgs.noInteractive,
  });
  if (!fs.existsSync(store)) {
    process.stdout.write(`MISSING store directory: ${store}\n`);
    return 1;
  }

  const manifest = loadManifest(store);
  const manifestIds = new Set(
    (manifest.entries ?? []).map((e) => e.id),
  );
  const issues: string[] = [];

  const mdFiles = findMdFilesFiltered(store);
  for (const mdFile of mdFiles) {
    const rel = path.relative(store, mdFile).split(path.sep).join("/");
    let fm: Record<string, import("./frontmatter.ts").FmValue>;
    let body: string;
    try {
      [fm, body] = readEntry(mdFile);
    } catch (exc) {
      issues.push(`PARSE ERROR ${rel}: ${exc}`);
      continue;
    }
    const errs = validateEntry(fm);
    for (const e of errs) {
      issues.push(`SCHEMA ${rel}: ${e}`);
    }
    const entryId = fm["id"];
    if (entryId && !manifestIds.has(String(entryId))) {
      issues.push(`MISSING FROM MANIFEST ${rel}  id=${entryId}`);
    }
    const broken = checkLinks(body, path.dirname(mdFile));
    for (const href of broken) {
      issues.push(`BROKEN LINK ${rel}: ${JSON.stringify(href)}`);
    }
    const indexPath = path.join(path.dirname(mdFile), "_index.md");
    if (fs.existsSync(indexPath)) {
      const idxText = fs.readFileSync(indexPath, "utf-8");
      if (!idxText.includes(path.basename(mdFile))) {
        issues.push(`MISSING FROM INDEX ${rel}`);
      }
    }
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      process.stdout.write(`${issue}\n`);
    }
    return 1;
  }
  process.stdout.write("kb: store is healthy\n");
  return 0;
}

// ---------------------------------------------------------------------------
// Internal: file scanner (same filter as Python)
// ---------------------------------------------------------------------------

function findMdFilesFiltered(store: string): string[] {
  const STORE_CONFIG_NAME = ".kb";
  const results: string[] = [];
  function walk(d: string) {
    let entries: import("node:fs").Dirent[];
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
  walk(store);
  return results.filter((f) => {
    const rel = path.relative(store, f);
    const parts = rel.split(path.sep);
    if (parts[0] === STORE_CONFIG_NAME) return false;
    if (path.basename(f) === "log.md") return false;
    if (path.basename(f).startsWith("_")) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Exported internal functions (for tests that mirror Python's direct calls)
// ---------------------------------------------------------------------------

export { resolveStore } from "./config.ts";
export { validateEntry } from "./schema.ts";
export { parseTtl } from "./schema.ts";
export { scanSecrets as _scan_secrets } from "./secrets.ts";
export { shannonEntropy as _shannon_entropy } from "./secrets.ts";
export { loadManifest as _load_manifest } from "./store.ts";
export { readEntry as _read_entry } from "./store.ts";
export { ensureStore as _ensure_store } from "./config.ts";
export { runGitleaksCheck as _run_gitleaks_check } from "./git.ts";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function main(argv: string[]): number {
  const globalArgs = parseGlobal(argv);
  switch (globalArgs.verb) {
    case "save":
      return cmdSave(globalArgs);
    case "validate":
      return cmdValidate(globalArgs);
    case "stale":
      return cmdStale(globalArgs);
    case "doctor":
      return cmdDoctor(globalArgs);
    default:
      process.stderr.write(
        `kb: error: unknown verb ${globalArgs.verb}; expected save|validate|stale|doctor\n`,
      );
      return 1;
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  process.exit(main(process.argv.slice(2)));
}
