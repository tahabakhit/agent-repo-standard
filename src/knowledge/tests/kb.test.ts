/**
 * Tests for knowledge/src/kb.ts — faithful TypeScript port of test_kb.py.
 *
 * All tests use os.tmpdir() + fs.mkdtemp for isolation.
 * No real store, repo, or user config is touched.
 */

import test, { describe, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

import * as kb from "../src/kb.ts";
import { kbSeams } from "../src/kb.ts";
import { gitSeams } from "../src/git.ts";
import { parseFrontmatter, serializeFrontmatter, splitEntryText } from "../src/frontmatter.ts";
import { parseTtl } from "../src/schema.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeEnv(
  tmpHome: string,
  extra: Record<string, string> = {},
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    HOME: tmpHome,
    XDG_CONFIG_HOME: path.join(tmpHome, "config"),
    AMANAR_KB_DIR: undefined,
  };
  return { ...env, ...extra };
}

function gitInitStore(store: string): void {
  spawnSync("git", ["init", "-q", store], { encoding: "utf-8" });
  spawnSync("git", ["config", "user.email", "test@kb.local"], {
    cwd: store,
    encoding: "utf-8",
  });
  spawnSync("git", ["config", "user.name", "Test"], {
    cwd: store,
    encoding: "utf-8",
  });
}

interface SaveEntryOptions {
  title?: string;
  entryType?: string;
  tags?: string;
  content?: string;
  extraArgs?: string[];
}

function saveEntry(store: string, opts: SaveEntryOptions = {}): number {
  const {
    title = "Test entry",
    entryType = "fact",
    tags = "x,y",
    content = "Some markdown content.\n",
    extraArgs = [],
  } = opts;
  const argv = [
    "--store",
    store,
    "--no-interactive",
    "save",
    "--title",
    title,
    "--type",
    entryType,
    "--tags",
    tags,
    "--confidence",
    "high",
    "--provenance",
    "human",
    "--ttl",
    "30d",
    ...extraArgs,
  ];
  kbSeams.stdinContent = content;
  try {
    return kb.main(argv);
  } finally {
    kbSeams.stdinContent = null;
  }
}

/** Replace process.exit with a throwing version, run fn, return exit code. */
function withMockedExit(fn: () => void): number {
  const orig = process.exit.bind(process);
  let code = -1;
  (process as { exit: (c?: number) => never }).exit = (c?: number) => {
    code = c ?? 0;
    throw new Error(`__process_exit__${c}`);
  };
  try {
    fn();
  } catch (e) {
    if (
      !(e instanceof Error && e.message.startsWith("__process_exit__"))
    ) {
      process.exit = orig;
      throw e;
    }
  } finally {
    process.exit = orig;
  }
  return code;
}

function mkTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kb-test-"));
}

function rmTmpDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Config precedence tests (6 tests — mirrors TestConfigPrecedence)
// ---------------------------------------------------------------------------

describe("Config precedence", () => {
  let base: string;
  beforeEach(() => {
    base = mkTmpDir();
  });
  afterEach(() => {
    rmTmpDir(base);
  });

  test("flag beats env", () => {
    const flagStore = path.join(base, "flag-store");
    const envStore = path.join(base, "env-store");
    fs.mkdirSync(envStore);
    const resolved = kb.resolveStore(flagStore, {
      interactive: false,
      env: { ...fakeEnv(base), AMANAR_KB_DIR: envStore },
      cwd: base,
      home: base,
    });
    assert.equal(resolved, path.resolve(flagStore));
  });

  test("env beats project dir", () => {
    const envStore = path.join(base, "env-store");
    fs.mkdirSync(envStore);
    const projStore = path.join(base, "cwd", ".knowledge");
    fs.mkdirSync(projStore, { recursive: true });
    const resolved = kb.resolveStore(null, {
      interactive: false,
      env: { ...fakeEnv(base), AMANAR_KB_DIR: envStore },
      cwd: path.join(base, "cwd"),
      home: base,
    });
    assert.equal(resolved, path.resolve(envStore));
  });

  test("project .knowledge beats xdg", () => {
    const cwd = path.join(base, "project");
    const projStore = path.join(cwd, ".knowledge");
    fs.mkdirSync(projStore, { recursive: true });
    // XDG points elsewhere
    const xdgCfg = path.join(base, "config", "amanar");
    fs.mkdirSync(xdgCfg, { recursive: true });
    const xdgTarget = path.join(base, "xdg-store");
    fs.mkdirSync(xdgTarget);
    fs.writeFileSync(path.join(xdgCfg, "kb.yml"), `store: ${xdgTarget}\n`);
    const resolved = kb.resolveStore(null, {
      interactive: false,
      env: fakeEnv(base),
      cwd,
      home: base,
    });
    assert.equal(resolved, path.resolve(projStore));
  });

  test("project .kb/config.yml pointer", () => {
    const cwd = path.join(base, "project");
    fs.mkdirSync(path.join(cwd, ".kb"), { recursive: true });
    const pointedStore = path.join(base, "pointed-store");
    fs.mkdirSync(pointedStore);
    fs.writeFileSync(
      path.join(cwd, ".kb", "config.yml"),
      `store: ${pointedStore}\n`,
    );
    const resolved = kb.resolveStore(null, {
      interactive: false,
      env: fakeEnv(base),
      cwd,
      home: base,
    });
    assert.equal(resolved, path.resolve(pointedStore));
  });

  test("xdg config fallback", () => {
    const xdgCfg = path.join(base, "config", "amanar");
    fs.mkdirSync(xdgCfg, { recursive: true });
    const target = path.join(base, "xdg-store");
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(xdgCfg, "kb.yml"), `store: ${target}\n`);
    const resolved = kb.resolveStore(null, {
      interactive: false,
      env: fakeEnv(base),
      cwd: path.join(base, "empty-cwd"),
      home: base,
    });
    assert.equal(resolved, path.resolve(target));
  });

  test("no config non-interactive errors with non-zero exit", () => {
    const code = withMockedExit(() => {
      kb.resolveStore(null, {
        interactive: false,
        env: fakeEnv(base),
        cwd: path.join(base, "empty"),
        home: base,
      });
    });
    assert.notEqual(code, 0);
  });
});

// ---------------------------------------------------------------------------
// Secret scan tests (7 tests — mirrors TestSecretScan)
// ---------------------------------------------------------------------------

describe("Secret scan", () => {
  test("clean content passes", () => {
    assert.deepEqual(kb._scan_secrets("This is a normal markdown note.\n"), []);
  });

  test("AWS AKIA key detected", () => {
    const text = "Use the key AKIAIOSFODNN7EXAMPLE for testing.";
    const findings = kb._scan_secrets(text);
    assert.ok(
      findings.some((f) => f.includes("AWS")),
      `Expected AWS finding, got: ${JSON.stringify(findings)}`,
    );
  });

  test("PEM private key detected", () => {
    const text =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n";
    const findings = kb._scan_secrets(text);
    assert.ok(
      findings.some((f) => f.toLowerCase().includes("private key")),
      `Expected private key finding, got: ${JSON.stringify(findings)}`,
    );
  });

  test("password assignment detected", () => {
    const text = "config: password=supersecretvalue123\n";
    const findings = kb._scan_secrets(text);
    assert.ok(
      findings.some((f) => f.toLowerCase().includes("credential")),
      `Expected credential finding, got: ${JSON.stringify(findings)}`,
    );
  });

  test("api_key assignment detected", () => {
    const text = "api_key=abc123defghijklmnopqrstuvwxyz";
    const findings = kb._scan_secrets(text);
    assert.ok(
      findings.some((f) => f.toLowerCase().includes("credential")),
      `Expected credential finding, got: ${JSON.stringify(findings)}`,
    );
  });

  test("high entropy token detected", () => {
    // 40 chars of high-entropy base64-ish string
    const text = "token: ghp_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8";
    const findings = kb._scan_secrets(text);
    // should catch high-entropy OR credential assignment
    assert.ok(
      findings.length > 0,
      `Expected findings, got: ${JSON.stringify(findings)}`,
    );
  });

  test("save aborts on secret", () => {
    const td = mkTmpDir();
    try {
      const store = path.join(td, "store");
      fs.mkdirSync(store);
      kbSeams.stdinContent = "password=supersecret123 is here\n";
      let code: number;
      try {
        code = kb.main([
          "--store",
          store,
          "--no-interactive",
          "save",
          "--title",
          "Bad entry",
        ]);
      } finally {
        kbSeams.stdinContent = null;
      }
      assert.notEqual(code!, 0);
    } finally {
      rmTmpDir(td);
    }
  });
});

// ---------------------------------------------------------------------------
// Schema validation tests (11 tests — mirrors TestSchemaValidation)
// ---------------------------------------------------------------------------

describe("Schema validation", () => {
  function valid(): Record<string, unknown> {
    return {
      id: "test-id-001",
      type: "fact",
      title: "Valid entry",
      status: "active",
    };
  }

  test("valid minimal entry passes", () => {
    assert.deepEqual(kb.validateEntry(valid() as any), []);
  });

  test("missing required id", () => {
    const fm = valid();
    delete fm["id"];
    const errors = kb.validateEntry(fm as any);
    assert.ok(
      errors.some((e) => e.includes("id")),
      `Expected id error, got: ${JSON.stringify(errors)}`,
    );
  });

  test("missing required type", () => {
    const fm = valid();
    delete fm["type"];
    const errors = kb.validateEntry(fm as any);
    assert.ok(
      errors.some((e) => e.includes("type")),
      `Expected type error, got: ${JSON.stringify(errors)}`,
    );
  });

  test("missing required title", () => {
    const fm = valid();
    delete fm["title"];
    const errors = kb.validateEntry(fm as any);
    assert.ok(
      errors.some((e) => e.includes("title")),
      `Expected title error, got: ${JSON.stringify(errors)}`,
    );
  });

  test("missing required status", () => {
    const fm = valid();
    delete fm["status"];
    const errors = kb.validateEntry(fm as any);
    assert.ok(
      errors.some((e) => e.includes("status")),
      `Expected status error, got: ${JSON.stringify(errors)}`,
    );
  });

  test("invalid status enum", () => {
    const fm = valid();
    fm["status"] = "deleted";
    const errors = kb.validateEntry(fm as any);
    assert.ok(
      errors.some((e) => e.includes("status")),
      `Expected status error, got: ${JSON.stringify(errors)}`,
    );
  });

  test("invalid confidence enum", () => {
    const fm = valid();
    fm["confidence"] = "ultra";
    const errors = kb.validateEntry(fm as any);
    assert.ok(
      errors.some((e) => e.includes("confidence")),
      `Expected confidence error, got: ${JSON.stringify(errors)}`,
    );
  });

  test("invalid provenance enum", () => {
    const fm = valid();
    fm["provenance"] = "robot";
    const errors = kb.validateEntry(fm as any);
    assert.ok(
      errors.some((e) => e.includes("provenance")),
      `Expected provenance error, got: ${JSON.stringify(errors)}`,
    );
  });

  test("invalid ttl format", () => {
    const fm = valid();
    fm["ttl"] = "two-weeks";
    const errors = kb.validateEntry(fm as any);
    assert.ok(
      errors.some((e) => e.includes("ttl")),
      `Expected ttl error, got: ${JSON.stringify(errors)}`,
    );
  });

  test("tags not list fails", () => {
    const fm = valid();
    fm["tags"] = "tag1,tag2";
    const errors = kb.validateEntry(fm as any);
    assert.ok(
      errors.some((e) => e.includes("tags")),
      `Expected tags error, got: ${JSON.stringify(errors)}`,
    );
  });

  test("full valid entry passes", () => {
    const fm = {
      id: "full-001",
      type: "decision",
      title: "Use stdlib only",
      description: "Avoid third-party dependencies.",
      status: "active",
      tags: ["python", "stdlib"],
      created: "2026-07-24T00:00:00Z",
      last_verified: "2026-07-24T00:00:00Z",
      ttl: "90d",
      confidence: "high",
      provenance: "human",
      sources: [
        { url: "https://example.com", sha256: "", ingested: "2026-07-24" },
      ],
    };
    assert.deepEqual(kb.validateEntry(fm as any), []);
  });
});

// ---------------------------------------------------------------------------
// Frontmatter round-trip tests (5 tests — mirrors TestFrontmatterRoundtrip)
// ---------------------------------------------------------------------------

describe("Frontmatter roundtrip", () => {
  function roundtrip(data: Record<string, unknown>): Record<string, unknown> {
    const text = serializeFrontmatter(data as any);
    const [fmText] = splitEntryText(text + "\n\nbody");
    return parseFrontmatter(fmText) as Record<string, unknown>;
  }

  test("scalar fields roundtrip", () => {
    const data = { id: "x", type: "fact", title: "My title", status: "active" };
    const rt = roundtrip(data);
    assert.equal(rt["id"], "x");
    assert.equal(rt["title"], "My title");
    assert.equal(rt["status"], "active");
  });

  test("tag list roundtrip", () => {
    const data = {
      id: "x",
      type: "fact",
      title: "T",
      status: "active",
      tags: ["a", "b", "c"],
    };
    const rt = roundtrip(data);
    assert.deepEqual(rt["tags"], ["a", "b", "c"]);
  });

  test("source object list roundtrip", () => {
    const sources = [
      { url: "https://ex.com", sha256: "abc", ingested: "2026-07-24" },
    ];
    const data = {
      id: "x",
      type: "fact",
      title: "T",
      status: "active",
      sources,
    };
    const rt = roundtrip(data);
    assert.ok(Array.isArray(rt["sources"]));
    const rtSources = rt["sources"] as Record<string, string>[];
    assert.equal(rtSources.length, 1);
    assert.equal(rtSources[0]["url"], "https://ex.com");
    assert.equal(rtSources[0]["sha256"], "abc");
  });

  test("empty tags roundtrip", () => {
    const data = {
      id: "x",
      type: "fact",
      title: "T",
      status: "active",
      tags: [],
    };
    const rt = roundtrip(data);
    assert.deepEqual(rt["tags"], []);
  });

  test("title with special chars roundtrip", () => {
    const data = {
      id: "x",
      type: "fact",
      title: "Title: with colon",
      status: "active",
    };
    const rt = roundtrip(data);
    assert.equal(rt["title"], "Title: with colon");
  });
});

// ---------------------------------------------------------------------------
// Dedup / archive-with-pointer tests (4 tests — mirrors TestDedup)
// ---------------------------------------------------------------------------

describe("Dedup", () => {
  let base: string;
  let store: string;

  beforeEach(() => {
    base = mkTmpDir();
    store = path.join(base, "store");
    fs.mkdirSync(store);
    gitInitStore(store);
    kb._ensure_store(store);
  });

  afterEach(() => {
    rmTmpDir(base);
  });

  function save(
    title: string,
    tags = "",
    content = "Body.\n",
  ): number {
    return saveEntry(store, { title, tags, content });
  }

  test("first save succeeds", () => {
    const code = save("Unique title A");
    assert.equal(code, 0);
  });

  test("duplicate title archives old", () => {
    // First save
    save("Dedup target");
    const manifest1 = kb._load_manifest(store);
    assert.equal(manifest1.entries.length, 1);
    const oldPath = path.join(store, ...manifest1.entries[0].path.split("/"));

    // Second save with same title
    save("Dedup target");
    // Old entry should now be archived
    const [fm, body] = kb._read_entry(oldPath);
    assert.equal(fm["status"], "archive");
    assert.ok(body.includes("superseded"));

    // New entry should be active
    const manifest2 = kb._load_manifest(store);
    const active = manifest2.entries.filter((e: any) => e.status !== "archive");
    assert.equal(active.length, 1);
  });

  test("overlapping tags archives old", () => {
    save("Entry one", "ml,python");
    const manifest1 = kb._load_manifest(store);
    const oldPath = path.join(store, ...manifest1.entries[0].path.split("/"));

    save("Entry two", "python,stdlib");
    const [fm] = kb._read_entry(oldPath);
    assert.equal(fm["status"], "archive");
  });

  test("non-overlapping saves both active", () => {
    save("Entry alpha", "golang");
    save("Entry beta", "rust");
    const manifest = kb._load_manifest(store);
    const active = manifest.entries.filter((e: any) => e.status !== "archive");
    assert.equal(active.length, 2);
  });
});

// ---------------------------------------------------------------------------
// Full save integration tests (7 tests — mirrors TestFullSaveIntegration)
// ---------------------------------------------------------------------------

describe("Full save integration", () => {
  let base: string;
  let store: string;

  beforeEach(() => {
    base = mkTmpDir();
    store = path.join(base, "knowledge-store");
    fs.mkdirSync(store);
    gitInitStore(store);
  });

  afterEach(() => {
    rmTmpDir(base);
  });

  test("save creates expected files", () => {
    const code = saveEntry(store, {
      title: "Integration test entry",
      entryType: "decision",
      tags: "test,integration",
      content: "This documents an important decision.\n",
    });
    assert.equal(code, 0);

    // Entry file exists inside <type>/ (exclude _index.md)
    const typeDir = path.join(store, "decision");
    const mdFiles = fs
      .readdirSync(typeDir)
      .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
      .map((f) => path.join(typeDir, f));
    assert.equal(mdFiles.length, 1);

    // Frontmatter is parseable and correct
    const [fm, _body] = kb._read_entry(mdFiles[0]);
    assert.equal(fm["type"], "decision");
    assert.equal(fm["title"], "Integration test entry");
    assert.ok(
      Array.isArray(fm["tags"]) && (fm["tags"] as string[]).includes("test"),
    );
    assert.equal(fm["status"], "active");

    // _index.md lists the entry
    const indexPath = path.join(typeDir, "_index.md");
    assert.ok(fs.existsSync(indexPath));
    assert.ok(
      fs.readFileSync(indexPath, "utf-8").includes(path.basename(mdFiles[0])),
    );

    // log.md has a log line
    const log = fs.readFileSync(path.join(store, "log.md"), "utf-8");
    assert.ok(log.includes("Integration test entry"));

    // manifest.json has the entry
    const manifest = kb._load_manifest(store);
    assert.equal(manifest.entries.length, 1);
    const meta = manifest.entries[0];
    assert.equal(meta.title, "Integration test entry");
    assert.equal(meta.type, "decision");
  });

  test("save commits to store git", () => {
    saveEntry(store, { title: "Git commit test", content: "Content.\n" });

    const result = spawnSync("git", ["log", "--oneline"], {
      cwd: store,
      encoding: "utf-8",
    });
    assert.equal(result.status, 0);
    assert.ok(result.stdout.trim().length > 0);
    assert.ok(result.stdout.includes("kb:"));
  });

  test("manifest.json is valid JSON", () => {
    saveEntry(store, { title: "JSON manifest check", content: "Body.\n" });
    const manifestPath = path.join(store, "manifest.json");
    assert.ok(fs.existsSync(manifestPath));
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    assert.ok("entries" in data);
    assert.ok(Array.isArray(data.entries));
  });

  test("save from --file arg", () => {
    const contentFile = path.join(base, "entry.md");
    fs.writeFileSync(contentFile, "Content from a file.\n");
    const code = kb.main([
      "--store",
      store,
      "--no-interactive",
      "save",
      "--title",
      "File-sourced entry",
      "--type",
      "reference",
      "--file",
      contentFile,
    ]);
    assert.equal(code, 0);
    const typeDir = path.join(store, "reference");
    const mdFiles = fs
      .readdirSync(typeDir)
      .filter((f) => f.endsWith(".md") && !f.startsWith("_"));
    assert.equal(mdFiles.length, 1);
    const [, body] = kb._read_entry(path.join(typeDir, mdFiles[0]));
    assert.ok(body.includes("Content from a file"));
  });

  test("validate verb passes on clean store", () => {
    saveEntry(store, { title: "Validate test", content: "Body.\n" });
    const code = kb.main([
      "--store",
      store,
      "--no-interactive",
      "validate",
    ]);
    assert.equal(code, 0);
  });

  test("stale verb runs without error", () => {
    saveEntry(store, { title: "Stale test", content: "Body.\n" });
    const code = kb.main([
      "--store",
      store,
      "--no-interactive",
      "stale",
    ]);
    assert.equal(code, 0);
  });

  test("doctor verb passes on healthy store", () => {
    saveEntry(store, { title: "Doctor test", content: "Body.\n" });
    const code = kb.main([
      "--store",
      store,
      "--no-interactive",
      "doctor",
    ]);
    assert.equal(code, 0);
  });
});

// ---------------------------------------------------------------------------
// Stale parsing unit tests (4 tests — mirrors TestStaleParsing)
// ---------------------------------------------------------------------------

describe("Stale parsing", () => {
  test("ttl days", () => {
    const days = parseTtl("90d");
    assert.equal(days, 90);
  });

  test("ttl months", () => {
    const days = parseTtl("6m");
    assert.equal(days, 180);
  });

  test("ttl years", () => {
    const days = parseTtl("1y");
    assert.equal(days, 365);
  });

  test("invalid ttl raises", () => {
    assert.throws(
      () => parseTtl("two-weeks"),
      (err: Error) => err instanceof Error,
    );
  });
});

// ---------------------------------------------------------------------------
// Gitleaks defense-in-depth tests (5 tests — mirrors TestGitleaksDefenseInDepth)
// ---------------------------------------------------------------------------

describe("Gitleaks defense-in-depth", () => {
  afterEach(() => {
    // Reset all test seams
    gitSeams.whichImpl = null;
    gitSeams.spawnSyncGitleaksImpl = null;
    kbSeams.runGitleaksCheckOverride = null;
  });

  test("gitleaks absent is noop", () => {
    gitSeams.whichImpl = () => null;
    const findings = kb._run_gitleaks_check("/fake/store");
    assert.deepEqual(findings, []);
  });

  test("gitleaks clean scan returns empty", () => {
    gitSeams.whichImpl = () => "/usr/bin/gitleaks";
    gitSeams.spawnSyncGitleaksImpl = (_store: string) => ({
      status: 0,
      stdout: "",
      stderr: "",
    });
    const findings = kb._run_gitleaks_check("/fake/store");
    assert.deepEqual(findings, []);
  });

  test("gitleaks found secrets returns findings", () => {
    gitSeams.whichImpl = () => "/usr/bin/gitleaks";
    gitSeams.spawnSyncGitleaksImpl = (_store: string) => ({
      status: 1,
      stdout: "WRN secret leaked: AWS access key at line 3\n",
      stderr: "",
    });
    const findings = kb._run_gitleaks_check("/fake/store");
    assert.ok(findings.length > 0);
    assert.ok(findings.some((f) => f.includes("gitleaks")));
  });

  test("gitleaks found secrets aborts save", () => {
    const td = mkTmpDir();
    try {
      const store = path.join(td, "store");
      fs.mkdirSync(store);
      gitInitStore(store);

      kbSeams.runGitleaksCheckOverride = (_store: string) => [
        "gitleaks: leaked AWS key at fact/entry.md:1",
      ];
      const code = saveEntry(store, {
        title: "Gitleaks abort test",
        content: "Safe content.\n",
      });
      assert.notEqual(code, 0);
    } finally {
      kbSeams.runGitleaksCheckOverride = null;
      rmTmpDir(td);
    }
  });

  test("gitleaks absent save succeeds", () => {
    const td = mkTmpDir();
    try {
      const store = path.join(td, "store");
      fs.mkdirSync(store);
      gitInitStore(store);

      gitSeams.whichImpl = () => null;
      const code = saveEntry(store, {
        title: "No gitleaks test",
        content: "Normal content.\n",
      });
      assert.equal(code, 0);
    } finally {
      gitSeams.whichImpl = null;
      rmTmpDir(td);
    }
  });
});
