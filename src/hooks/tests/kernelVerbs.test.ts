import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runKernelVerb,
  formatVerbResult,
  kernelCliPath,
  type SpawnResult,
} from "../../kernelVerbs.ts";

function withRepo(fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "kv-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function vendorKernel(root: string): void {
  mkdirSync(join(root, ".amanar", "kernel"), { recursive: true });
  writeFileSync(kernelCliPath(root), "// stub kernel\n");
}

test("runKernelVerb: no vendored kernel → available:false with an onboarding nudge", () => {
  withRepo((root) => {
    const r = runKernelVerb(root, ["status", "--json"]);
    assert.equal(r.available, false);
    assert.equal(r.ok, false);
    assert.ok(r.stderr.includes("$amanar-onboard"));
  });
});

test("runKernelVerb: passes verb args to the spawn and reports exit 0 as ok", () => {
  withRepo((root) => {
    let seen: string[] = [];
    const spawn = (_root: string, _cli: string, args: string[]): SpawnResult => {
      seen = args;
      return { status: 0, stdout: '{"status":"verified","current":true}', stderr: "" };
    };
    vendorKernel(root);
    const r = runKernelVerb(root, ["run-check", "unit"], spawn);
    assert.deepEqual(seen, ["run-check", "unit"]);
    assert.equal(r.available, true);
    assert.equal(r.ok, true);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("verified"));
  });
});

test("runKernelVerb: non-zero exit → ok:false", () => {
  withRepo((root) => {
    vendorKernel(root);
    const spawn = (): SpawnResult => ({ status: 4, stdout: "", stderr: "AMANAR_ERROR nope" });
    const r = runKernelVerb(root, ["verify"], spawn);
    assert.equal(r.ok, false);
    assert.equal(r.exitCode, 4);
  });
});

test("formatVerbResult: unavailable → isError with the nudge text", () => {
  const out = formatVerbResult({
    available: false,
    ok: false,
    exitCode: null,
    stdout: "",
    stderr: "no kernel",
  });
  assert.equal(out.isError, true);
  assert.equal(out.content[0].text, "no kernel");
});

test("formatVerbResult: success → text is stdout, not an error", () => {
  const out = formatVerbResult({
    available: true,
    ok: true,
    exitCode: 0,
    stdout: "AMANAR_VERIFIED id=x",
    stderr: "",
  });
  assert.equal(out.isError, false);
  assert.ok(out.content[0].text.includes("AMANAR_VERIFIED"));
});

test("formatVerbResult: failure merges stdout+stderr and flags isError", () => {
  const out = formatVerbResult({
    available: true,
    ok: false,
    exitCode: 6,
    stdout: "partial",
    stderr: "AMANAR_ERROR boom",
  });
  assert.equal(out.isError, true);
  assert.ok(out.content[0].text.includes("partial"));
  assert.ok(out.content[0].text.includes("boom"));
});
