import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DATA_ROOT,
  assertCanonicalFilename,
  buildIndex,
  combinationScore,
  detectEvaluators,
  loadAndVerifyRun,
  normalizeRun,
  renderDashboard,
  safeRunPath,
  scoreAxes,
  verifyArtifact,
  verifyPromptfooResult,
} from "../scripts/agent-eval.mjs";

const fullAxes = Object.fromEntries(
  ["V", "U", "E", "X", "R", "S", "M", "F", "C"].map((key) => [
    key,
    { value: 5, reason: `${key} evidence`, evidenceState: "estimated", evidence: ["source:fixture"] },
  ]),
);

const promptfooResult = "artifacts/2026-07-17-example/promptfoo/result.json";

function axesWith(state, evidence) {
  const axes = structuredClone(fullAxes);
  for (const axis of Object.values(axes)) {
    axis.evidenceState = state;
    if (evidence) axis.evidence = [evidence];
  }
  return axes;
}

test("uses the local marketplace source as the canonical data root", () => {
  assert.equal(DATA_ROOT, path.resolve(import.meta.dirname, ".."));
});

function run(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "2026-07-17-example",
    startedAt: "2026-07-17T00:00:00Z",
    finishedAt: "2026-07-17T00:01:00Z",
    mode: "quick",
    status: "completed",
    evidenceState: "estimated",
    target: { kind: "skill", name: "Example", source: "/tmp/example", version: "abc123" },
    axes: structuredClone(fullAxes),
    methods: [
      {
        name: "plugin-eval",
        status: "completed",
        version: "0.1.0",
        exactCommand: "plugin-eval analyze /tmp/example --format json",
        exitCode: 0,
        durationMs: 100,
        metrics: {},
        artifactLinks: ["artifacts/2026-07-17-example/plugin-eval/result.json"],
      },
    ],
    platforms: {
      codex: { status: "completed", axes: structuredClone(fullAxes), evidenceState: "estimated" },
      pi: { status: "unsupported", reason: "No adapter" },
    },
    combinations: [],
    findings: [],
    decision: "trial",
    provenance: {
      harness: "codex",
      model: "gpt-5.4",
      repositoryRevision: "abc123",
      sandbox: "read-only",
      approvalPolicy: "never",
      network: "disabled",
      enabledExtensions: ["agent-eval"],
    },
    ...overrides,
  };
}

test("scores the nine axes and derives bloat", () => {
  assert.deepEqual(scoreAxes(fullAxes), { score: 100, bloat: 0 });
  const axes = structuredClone(fullAxes);
  axes.V.value = 0;
  axes.C.value = 2;
  assert.deepEqual(scoreAxes(axes), { score: 69, bloat: 3 });
});

test("normalizes estimated runs and never scores unsupported platforms", () => {
  const result = normalizeRun(run());
  assert.equal(result.score, 100);
  assert.equal(result.confidence, "C");
  assert.equal(result.platforms.codex.score, 100);
  assert.equal(result.platforms.codex.confidence, "C");
  assert.equal(result.platforms.pi.score, undefined);
});

test("requires verified runtime evidence before accepting mixed state", () => {
  const candidate = run({ evidenceState: "mixed" });
  candidate.axes.E.evidenceState = "measured";
  candidate.axes.E.evidence = [promptfooResult];
  assert.throws(() => normalizeRun(candidate), /verified runtime artifact/);
  assert.equal(normalizeRun(candidate, { runtimeObserved: true, runtimeArtifactLinks: [promptfooResult] }).confidence, "B");
});

test("rejects measured claims without a paired verified outcome", () => {
  assert.throws(
    () => normalizeRun(run({ evidenceState: "measured", mode: "full" })),
    /paired verified outcome/,
  );

  const candidate = run({ evidenceState: "measured", mode: "full", axes: axesWith("measured", promptfooResult) });
  candidate.methods.push({
    name: "promptfoo",
    status: "completed",
    version: "0.121.19",
    exactCommand: "promptfoo eval -c promptfooconfig.yaml --repeat 3 --no-cache",
    exitCode: 0,
    durationMs: 1000,
    metrics: { pairedBaseline: true, deterministicVerifier: true },
    artifactLinks: [
      "artifacts/2026-07-17-example/promptfoo/promptfooconfig.yaml",
      "artifacts/2026-07-17-example/promptfoo/result.json",
    ],
  });
  assert.throws(() => normalizeRun(candidate), /paired verified outcome/);
  assert.equal(normalizeRun(candidate, {
    pairedVerified: true,
    pairedPlatforms: ["codex"],
    runtimeArtifactLinks: [promptfooResult],
  }).confidence, "A");

  const unrelatedSource = structuredClone(candidate);
  unrelatedSource.axes = axesWith("measured");
  assert.throws(() => normalizeRun(unrelatedSource, {
    pairedVerified: true,
    pairedPlatforms: ["codex"],
    runtimeArtifactLinks: [promptfooResult],
  }), /measured axis must cite a verified runtime artifact/);
});

test("derives paired deterministic evidence from Promptfoo rows", () => {
  const row = (label, repeat) => ({
    id: `${label}-${repeat}`,
    provider: { id: "openai:codex-app-server:gpt-5.4", label },
    promptId: "same-prompt",
    testIdx: 0,
    success: true,
    gradingResult: {
      componentResults: [{ pass: true, score: 1, assertion: { type: "equals", value: "ok" } }],
    },
    metadata: { repeat },
  });
  const result = {
    results: {
      results: [0, 1, 2].flatMap((repeat) => [row("baseline", repeat), row("candidate", repeat)]),
    },
  };
  assert.deepEqual(verifyPromptfooResult(result), {
    pairedBaseline: true,
    deterministicVerifier: true,
    baselineTrials: 3,
    candidateTrials: 3,
    baselinePasses: 3,
    candidatePasses: 3,
    platforms: ["codex"],
  });
  const customProviderResult = structuredClone(result);
  customProviderResult.results.results.forEach((item) => {
    item.provider.id = "file://custom-coding-provider.mjs";
    item.metadata.platform = "codex";
  });
  assert.equal(verifyPromptfooResult(customProviderResult).platforms[0], "codex");
  const modelGraded = structuredClone(result);
  modelGraded.results.results[0].gradingResult.componentResults[0].assertion.type = "llm-rubric";
  assert.throws(() => verifyPromptfooResult(modelGraded), /deterministic assertions/);
  const unbalanced = structuredClone(result);
  unbalanced.results.results.push(row("baseline", 3));
  assert.throws(() => verifyPromptfooResult(unbalanced), /same number of trials per task/);
  const duplicatedRepeat = structuredClone(result);
  duplicatedRepeat.results.results.forEach((item) => { item.metadata.repeat = 0; });
  assert.throws(() => verifyPromptfooResult(duplicatedRepeat), /distinct repeat identifiers/);
  const operationalOnly = structuredClone(result);
  operationalOnly.results.results.forEach((item) => { item.gradingResult.componentResults[0].assertion.type = "cost"; });
  assert.throws(() => verifyPromptfooResult(operationalOnly), /outcome assertion/);
  const crossPlatform = structuredClone(result);
  crossPlatform.results.results.filter((item) => item.provider.label === "candidate").forEach((item) => { item.provider.id = "anthropic:claude-agent-sdk"; });
  assert.throws(() => verifyPromptfooResult(crossPlatform), /same known platform/);
});

test("scopes paired and runtime evidence to the platform that produced it", () => {
  const candidate = run();
  candidate.platforms.codex = { status: "completed", axes: axesWith("measured", promptfooResult), evidenceState: "measured" };
  candidate.platforms.pi = { status: "completed", axes: axesWith("measured", promptfooResult), evidenceState: "measured" };
  assert.throws(
    () => normalizeRun(candidate, { pairedVerified: true, pairedPlatforms: ["codex"], runtimeArtifactLinks: [promptfooResult] }),
    /platforms\.pi cannot be measured/,
  );
  candidate.platforms.pi = { status: "unsupported", reason: "No adapter" };
  const normalized = normalizeRun(candidate, { pairedVerified: true, pairedPlatforms: ["codex"], runtimeArtifactLinks: [promptfooResult] });
  assert.equal(normalized.platforms.codex.confidence, "A");
  assert.equal(normalized.platforms.pi.score, undefined);
});

test("computes estimated combinations from explicit terms and clamps the result", () => {
  assert.equal(
    combinationScore({ scoreA: 80, scoreB: 60, synergy: 7, controlConflict: 10, contextPenalty: 3, operationsPenalty: 2 }),
    72,
  );
  assert.equal(
    combinationScore({ scoreA: 98, scoreB: 97, synergy: 10, controlConflict: 0, contextPenalty: 0, operationsPenalty: 0 }),
    100,
  );
  const candidate = run({ combinations: [{
    name: "A plus B",
    members: ["A", "B"],
    evidenceState: "measured",
    axes: axesWith("measured"),
    artifactLinks: ["artifacts/2026-07-17-example/combinations/result.json"],
  }] });
  assert.throws(() => normalizeRun(candidate, { pairedVerified: true }), /Measured combinations are not supported/);
});

test("builds a newest-first dashboard index with method evidence", () => {
  const olderInput = run({ id: "older", startedAt: "2026-07-15T23:59:00Z", finishedAt: "2026-07-16T00:00:00Z" });
  olderInput.methods[0].artifactLinks = ["artifacts/older/plugin-eval/result.json"];
  const newerInput = run({ id: "newer", finishedAt: "2026-07-17T00:00:00Z" });
  newerInput.methods[0].artifactLinks = ["artifacts/newer/plugin-eval/result.json"];
  const older = normalizeRun(olderInput);
  const newer = normalizeRun(newerInput);
  const index = buildIndex([older, newer]);
  assert.equal(index.runs[0].id, "newer");
  assert.equal(index.runs[1].id, "older");
  assert.match(index.runs[0].methods[0].exactCommand, /plugin-eval analyze/);
  assert.throws(() => buildIndex([newer, newer]), /Duplicate run id/);
  assert.throws(() => assertCanonicalFilename("other.json", "newer"), /does not match run id/);
});

test("renders an offline dashboard without injecting run text as markup", () => {
  const unsafe = normalizeRun(run({ target: { kind: "skill", name: "<script>alert(1)</script>", source: "/tmp/example", version: "abc123" } }));
  const template = "<html><meta http-equiv=\"Content-Security-Policy\" content=\"script-src __AGENT_EVAL_SCRIPT_HASH__\"><script>const DATA=__AGENT_EVAL_DATA__;</script></html>";
  const html = renderDashboard(template, buildIndex([unsafe]));
  assert.match(html, /\\u003cscript\\u003ealert/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(html, /script-src 'sha256-[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(html, /__AGENT_EVAL_SCRIPT_HASH__|script-src 'unsafe-inline'/);

  const markerInData = normalizeRun(run({ target: { kind: "skill", name: "__AGENT_EVAL_SCRIPT_HASH__", source: "/tmp/example", version: "abc123" } }));
  assert.doesNotThrow(() => renderDashboard(template, buildIndex([markerInData])));
});

test("keeps canonical run paths inside the run directory", () => {
  const root = "/tmp/agent-eval/data/runs";
  assert.equal(safeRunPath(root, "valid-id"), "/tmp/agent-eval/data/runs/valid-id.json");
  assert.throws(() => safeRunPath(root, "../escape"), /Invalid run id/);
  assert.throws(() => safeRunPath(root, "bad/name"), /Invalid run id/);
});

test("rejects malformed axes and artifact traversal", () => {
  const missing = structuredClone(fullAxes);
  delete missing.U;
  assert.throws(() => scoreAxes(missing), /exactly V, U, E, X, R, S, M, F, C/);
  const fractional = structuredClone(fullAxes);
  fractional.V.value = 4.5;
  assert.throws(() => scoreAxes(fractional), /integer/);
  const missingState = structuredClone(fullAxes);
  delete missingState.V.evidenceState;
  assert.throws(() => scoreAxes(missingState), /evidenceState/);

  const candidate = run();
  candidate.methods[0].artifactLinks = ["../secret"];
  assert.throws(() => normalizeRun(candidate), /artifact path/);
  candidate.methods[0].artifactLinks = ["/tmp/secret"];
  assert.throws(() => normalizeRun(candidate), /artifact path/);
  candidate.methods[0].artifactLinks = ["javascript:alert(1)"];
  assert.throws(() => normalizeRun(candidate), /artifact path/);
  candidate.methods[0].artifactLinks = ["artifacts/2026-07-17-example/%2e%2e/secret"];
  assert.throws(() => normalizeRun(candidate), /artifact path/);
  candidate.methods[0].artifactLinks = ["artifacts/2026-07-17-example/..\\secret"];
  assert.throws(() => normalizeRun(candidate), /artifact path/);

  const unsafeEvidence = run();
  unsafeEvidence.axes.V.evidence = ["file:///tmp/secret"];
  assert.throws(() => normalizeRun(unsafeEvidence), /evidence reference/);
  unsafeEvidence.axes.V.evidence = ["javascript:alert(1)"];
  assert.throws(() => normalizeRun(unsafeEvidence), /evidence reference/);
});

test("requires auditable method and provenance fields", () => {
  const missingVersion = run();
  delete missingVersion.methods[0].version;
  assert.throws(() => normalizeRun(missingVersion), /methods\[0\]\.version/);
  assert.throws(() => normalizeRun(run({ methods: [] })), /at least one method/);
  const missingRevision = run();
  delete missingRevision.provenance.repositoryRevision;
  assert.throws(() => normalizeRun(missingRevision), /provenance.repositoryRevision/);
  const failedCompletion = run();
  failedCompletion.methods[0].exitCode = 1;
  assert.throws(() => normalizeRun(failedCompletion), /completed method must have exitCode 0/);
  const incompleteFailure = run({ status: "failed" });
  incompleteFailure.methods[0] = {
    name: "promptfoo", status: "failed", exactCommand: "promptfoo eval", exitCode: 1, metrics: {}, artifactLinks: [],
  };
  assert.throws(() => normalizeRun(incompleteFailure), /version|failed method/);
  const failedMethodInCompletedRun = run();
  failedMethodInCompletedRun.methods.push({
    name: "promptfoo", status: "failed", version: "0.121.19", exactCommand: "promptfoo eval", exitCode: 1,
    durationMs: 50, skipReason: "provider failed", metrics: {},
    artifactLinks: ["artifacts/2026-07-17-example/promptfoo/error.txt"],
  });
  assert.throws(() => normalizeRun(failedMethodInCompletedRun), /completed run cannot contain failed or blocked methods/);
  const duplicateMethod = run();
  duplicateMethod.methods.push(structuredClone(duplicateMethod.methods[0]));
  assert.throws(() => normalizeRun(duplicateMethod), /Duplicate method name/);
  const unknownPlatform = run();
  unknownPlatform.platforms.unknown = { status: "unsupported", reason: "No adapter" };
  assert.throws(() => normalizeRun(unknownPlatform), /Unknown platform/);
  const reversedTime = run({ startedAt: "2026-07-17T00:02:00Z", finishedAt: "2026-07-17T00:01:00Z" });
  assert.throws(() => normalizeRun(reversedTime), /startedAt must not be after finishedAt/);
  const looseDate = run({ startedAt: "July 17, 2026" });
  assert.throws(() => normalizeRun(looseDate), /ISO UTC timestamp/);
});

test("evaluator detection does not inherit secrets or retain oversized output", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-eval-detect-"));
  const executable = path.join(directory, "promptfoo");
  await writeFile(executable, "#!/bin/sh\nprintf '%070000d\\n' 0\nprintf '%s\\n' \"${TEST_SECRET-unset}\"\n");
  await chmod(executable, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = directory;
  process.env.TEST_SECRET = "must-not-leak";
  try {
    const result = detectEvaluators();
    const promptfoo = result.find((item) => item.name === "promptfoo");
    assert.ok(String(promptfoo.version ?? "").length <= 256);
    assert.doesNotMatch(JSON.stringify(result), /must-not-leak/);
  } finally {
    process.env.PATH = originalPath;
    delete process.env.TEST_SECRET;
    await rm(directory, { recursive: true, force: true });
  }
});

test("evaluator detection reports Plugin Eval's package version", () => {
  const pluginEval = detectEvaluators().find((item) => item.name === "plugin-eval");
  assert.equal(pluginEval.status, "available");
  assert.match(pluginEval.version, /^\d+\.\d+\.\d+/);
});

test("artifact verification rejects symlinks that escape the run directory", async () => {
  const runId = "symlink-test";
  const projectRoot = path.resolve(import.meta.dirname, "..");
  const runDirectory = path.join(projectRoot, "artifacts", runId);
  const outsideDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-eval-outside-"));
  const outsideFile = path.join(outsideDirectory, "secret.txt");
  await mkdir(runDirectory, { recursive: true });
  await writeFile(outsideFile, "secret");
  await symlink(outsideFile, path.join(runDirectory, "escape.txt"));
  try {
    await assert.rejects(
      verifyArtifact(runId, `artifacts/${runId}/escape.txt`),
      /symlink escapes/,
    );
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
    await rm(outsideDirectory, { recursive: true, force: true });
  }
});

test("artifact verification rejects a symlinked run root", async () => {
  const runId = "symlink-root-test";
  const projectRoot = path.resolve(import.meta.dirname, "..");
  const runDirectory = path.join(projectRoot, "artifacts", runId);
  const outsideDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-eval-root-outside-"));
  await writeFile(path.join(outsideDirectory, "result.json"), "{}");
  await symlink(outsideDirectory, runDirectory);
  try {
    await assert.rejects(
      verifyArtifact(runId, `artifacts/${runId}/result.json`),
      /run root cannot be a symlink/,
    );
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
    await rm(outsideDirectory, { recursive: true, force: true });
  }
});

test("loader verifies axis artifacts and preserves Promptfoo configuration", async () => {
  const projectRoot = path.resolve(import.meta.dirname, "..");
  const axisRun = run({ id: "loader-axis-test" });
  axisRun.methods[0].artifactLinks = ["artifacts/loader-axis-test/plugin-eval/result.json"];
  axisRun.axes.V.evidence = ["artifacts/loader-axis-test/missing.json"];
  const axisDirectory = path.join(projectRoot, "artifacts", axisRun.id, "plugin-eval");
  await mkdir(axisDirectory, { recursive: true });
  await writeFile(path.join(axisDirectory, "result.json"), "{}");

  const promptfooRun = run({ id: "loader-promptfoo-test" });
  promptfooRun.methods = [{
    name: "promptfoo",
    status: "completed",
    version: "0.121.19",
    exactCommand: "promptfoo eval -c promptfooconfig.yaml",
    exitCode: 0,
    durationMs: 10,
    metrics: {},
    artifactLinks: ["artifacts/loader-promptfoo-test/promptfoo/result.json"],
  }];
  const promptfooDirectory = path.join(projectRoot, "artifacts", promptfooRun.id, "promptfoo");
  await mkdir(promptfooDirectory, { recursive: true });
  await writeFile(path.join(promptfooDirectory, "result.json"), "{}");

  const digestRun = run({ id: "loader-digest-test" });
  digestRun.methods[0].artifactLinks = ["artifacts/loader-digest-test/plugin-eval/result.json"];
  const digestDirectory = path.join(projectRoot, "artifacts", digestRun.id, "plugin-eval");
  await mkdir(digestDirectory, { recursive: true });
  const digestPath = path.join(digestDirectory, "result.json");
  await writeFile(digestPath, "first");

  try {
    await assert.rejects(loadAndVerifyRun(axisRun));
    await assert.rejects(loadAndVerifyRun(promptfooRun), /requires promptfoo\/promptfooconfig.yaml and promptfoo\/result.json/);
    const canonical = await loadAndVerifyRun(digestRun);
    assert.match(canonical.artifactDigests[digestRun.methods[0].artifactLinks[0]], /^[a-f0-9]{64}$/);
    await writeFile(digestPath, "changed");
    await assert.rejects(loadAndVerifyRun(canonical, { requireDigests: true }), /artifact digest mismatch/);
  } finally {
    await rm(path.join(projectRoot, "artifacts", axisRun.id), { recursive: true, force: true });
    await rm(path.join(projectRoot, "artifacts", promptfooRun.id), { recursive: true, force: true });
    await rm(path.join(projectRoot, "artifacts", digestRun.id), { recursive: true, force: true });
  }
});
