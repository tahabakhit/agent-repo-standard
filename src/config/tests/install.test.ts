import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { planConfigInstall, applyConfigInstall } from "../install.ts";

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

test("public doctrine template carries no personal identifiers", () => {
  const doctrine = readFileSync(join(REPO, "config", "doctrine", "doctrine.md"), "utf8");
  for (const term of ["Cazal", "Taha", "Mogador", "Igoudar"]) {
    assert.ok(!doctrine.includes(term), `doctrine leaks '${term}'`);
  }
});
