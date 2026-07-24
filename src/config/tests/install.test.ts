import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { planConfigInstall, applyConfigInstall, backupConfigTarget, stamp } from "../install.ts";
import { readdirSync } from "node:fs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

let base: string;
let env: NodeJS.ProcessEnv;
let overlayDir: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "cfg-"));
  env = {
    CLAUDE_HOME: join(base, "claude"),
    CODEX_HOME: join(base, "codex"),
    AGENTS_HOME: join(base, "agents"),
    AMANAR_CONFIG_HOME: join(base, "amanar-config"),
  };
  overlayDir = join(base, "overlay");
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

test("plan writes every template into the right host home; dry-run writes nothing", () => {
  const actions = planConfigInstall({ repoRoot: REPO, overlayDir, env });
  assert.ok(actions.length >= 7);
  assert.ok(actions.every((a) => a.op === "write" && !a.fromOverlay));
  // doctrine lands as CLAUDE.md for claude and AGENTS.md for codex
  assert.ok(actions.some((a) => a.host === "claude" && a.target.endsWith("/CLAUDE.md")));
  assert.ok(actions.some((a) => a.host === "codex" && a.target.endsWith("/AGENTS.md")));
  // dry-run: nothing on disk yet
  assert.ok(!existsSync(join(base, "claude", "CLAUDE.md")));
});

test("apply writes files; a re-plan reports them unchanged", () => {
  applyConfigInstall(planConfigInstall({ repoRoot: REPO, overlayDir, env }));
  assert.ok(existsSync(join(base, "claude", "settings.json")));
  assert.ok(existsSync(join(base, "amanar-config", "kb.yml")));
  const replan = planConfigInstall({ repoRoot: REPO, overlayDir, env });
  assert.ok(replan.every((a) => a.op === "unchanged"));
});

test("overlay overrides the public template and its content wins", () => {
  mkdirSync(join(overlayDir, "doctrine"), { recursive: true });
  writeFileSync(join(overlayDir, "doctrine", "doctrine.md"), "PRIVATE DOCTRINE\n");
  const actions = planConfigInstall({ repoRoot: REPO, overlayDir, env });
  const claudeDoctrine = actions.find((a) => a.host === "claude" && a.target.endsWith("/CLAUDE.md"));
  assert.ok(claudeDoctrine?.fromOverlay === true);
  applyConfigInstall(actions);
  assert.equal(readFileSync(join(base, "claude", "CLAUDE.md"), "utf8"), "PRIVATE DOCTRINE\n");
});

test("apply backs up an existing target before overwriting it (no silent clobber)", () => {
  const claudeMd = join(base, "claude", "CLAUDE.md");
  mkdirSync(dirname(claudeMd), { recursive: true });
  writeFileSync(claudeMd, "USER LIVE DOCTRINE\n");

  const backups = applyConfigInstall(planConfigInstall({ repoRoot: REPO, overlayDir, env }), "20260724T000000Z");

  // the live file was replaced with the template...
  assert.notEqual(readFileSync(claudeMd, "utf8"), "USER LIVE DOCTRINE\n");
  // ...but its original content is preserved in a stamped backup dir.
  const backupDir = join(base, "claude", "backups", "config-install-20260724T000000Z");
  const backedUp = join(backupDir, "CLAUDE.md");
  assert.ok(existsSync(backedUp), "expected a backup of the overwritten CLAUDE.md");
  assert.equal(readFileSync(backedUp, "utf8"), "USER LIVE DOCTRINE\n");
  assert.ok(backups.includes(backedUp));
});

test("apply does not create backups when no target exists yet", () => {
  const backups = applyConfigInstall(planConfigInstall({ repoRoot: REPO, overlayDir, env }), "20260724T000000Z");
  assert.deepEqual(backups, []);
  assert.ok(!existsSync(join(base, "claude", "backups")));
});

test("backupConfigTarget: absent target → null, present → copied under backups/", () => {
  const f = join(base, "x", "file.txt");
  assert.equal(backupConfigTarget(f, "S"), null);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, "orig");
  const dest = backupConfigTarget(f, "S");
  assert.ok(dest !== null && existsSync(dest));
  assert.equal(readFileSync(dest, "utf8"), "orig");
  assert.ok(readdirSync(join(base, "x", "backups")).includes("config-install-S"));
});

test("stamp: compact ISO with separators and millis stripped", () => {
  assert.equal(stamp(new Date("2026-07-24T01:02:03.456Z")), "20260724T010203Z");
});

test("public doctrine template carries no personal identifiers", () => {
  const doctrine = readFileSync(join(REPO, "config", "doctrine", "doctrine.md"), "utf8");
  for (const term of ["Cazal", "Taha", "Mogador", "Igoudar"]) {
    assert.ok(!doctrine.includes(term), `doctrine leaks '${term}'`);
  }
});
