#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, existsSync, readFileSync, realpathSync } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function dataRoot() {
  if (process.env.AGENT_EVAL_HOME) return path.resolve(process.env.AGENT_EVAL_HOME);
  const localMarketplacePath = path.join(homedir(), "plugins", "agent-eval");
  if (existsSync(path.join(localMarketplacePath, "package.json"))) return realpathSync(localMarketplacePath);
  if (APP_ROOT.includes(`${path.sep}.codex${path.sep}plugins${path.sep}cache${path.sep}`) || APP_ROOT.includes(`${path.sep}.codex${path.sep}.tmp${path.sep}`)) {
    // ponytail: stable fallback for non-local marketplaces; set AGENT_EVAL_HOME to keep data in a repo.
    return path.join(homedir(), ".local", "share", "agent-eval");
  }
  return APP_ROOT;
}

export const DATA_ROOT = dataRoot();
const RUNS_DIR = path.join(DATA_ROOT, "data", "runs");
const INDEX_PATH = path.join(DATA_ROOT, "data", "index.json");
const TEMPLATE_PATH = path.join(APP_ROOT, "web", "template.html");
const DASHBOARD_PATH = path.join(DATA_ROOT, "dist", "index.html");
const AXES = ["V", "U", "E", "X", "R", "S", "M", "F", "C"];
const WEIGHTS = { V: 25, U: 10, E: 10, X: 10, R: 10, S: 10, M: 5, F: 10, C: 10 };
const METHOD_STATUSES = new Set(["completed", "unavailable", "not-applicable", "blocked", "failed", "skipped"]);
const RUN_STATUSES = new Set(["completed", "partial", "blocked", "failed"]);
const PLATFORM_STATUSES = new Set(["completed", "unsupported", "unavailable", "not-run", "failed", "blocked", "skipped", "not-applicable"]);
const EVIDENCE_STATES = new Set(["measured", "mixed", "estimated"]);
const PLATFORMS = new Set(["codex", "claude-code", "pi", "hermes", "opencode"]);
const MAX_ARTIFACTS = 32;
const MAX_ARTIFACT_BYTES = 20_000_000;
const MAX_TOTAL_ARTIFACT_BYTES = 50_000_000;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function text(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function finite(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return value;
}

function stringList(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${label} must be an array of strings`);
  return value;
}

function validDate(value, label) {
  text(value, label);
  const date = new Date(value);
  const canonical = Number.isNaN(date.valueOf()) ? null : date.toISOString();
  if (!canonical || (value !== canonical && value !== canonical.replace(".000Z", "Z"))) throw new Error(`${label} must be an ISO UTC timestamp`);
  return value;
}

function validateEvidenceRef(reference, label, runId) {
  text(reference, label);
  if (reference.length > 500 || /\p{Cc}/u.test(reference)) throw new Error(`${label} is not a valid evidence reference`);
  if (reference.startsWith("https://")) {
    try { new URL(reference); } catch { throw new Error(`${label} is not a valid evidence reference`); }
    return reference;
  }
  if (reference.startsWith("artifacts/")) return validateArtifactLink(reference, label, runId ?? reference.split("/")[1]);
  if (/^source:[A-Za-z0-9._-]+$/.test(reference) || /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*(?::\d+)?$/.test(reference)) return reference;
  throw new Error(`${label} is not a valid evidence reference`);
}

export function scoreAxes(axes, runId) {
  object(axes, "axes");
  const keys = Object.keys(axes).sort();
  if (keys.length !== AXES.length || keys.some((key, index) => key !== [...AXES].sort()[index])) {
    throw new Error("axes must contain exactly V, U, E, X, R, S, M, F, C");
  }
  let total = 0;
  for (const key of AXES) {
    const axis = object(axes[key], `axes.${key}`);
    finite(axis.value, `axes.${key}.value`, 0, 5);
    if (!Number.isInteger(axis.value)) throw new Error(`axes.${key}.value must be an integer`);
    text(axis.reason, `axes.${key}.reason`);
    if (!EVIDENCE_STATES.has(axis.evidenceState)) throw new Error(`axes.${key}.evidenceState is invalid`);
    const evidence = stringList(axis.evidence, `axes.${key}.evidence`);
    if (!evidence.length) throw new Error(`axes.${key}.evidence must cite at least one artifact or source`);
    evidence.forEach((reference, index) => validateEvidenceRef(reference, `axes.${key}.evidence[${index}]`, runId));
    total += WEIGHTS[key] * axis.value / 5;
  }
  return { score: Math.round(total), bloat: 5 - axes.C.value };
}

export function combinationScore(terms) {
  object(terms, "combination terms");
  const scoreA = finite(terms.scoreA, "scoreA", 0, 100);
  const scoreB = finite(terms.scoreB, "scoreB", 0, 100);
  const synergy = finite(terms.synergy, "synergy", 0, 10);
  const controlConflict = finite(terms.controlConflict, "controlConflict", 0, 20);
  const contextPenalty = finite(terms.contextPenalty, "contextPenalty", 0, 10);
  const operationsPenalty = finite(terms.operationsPenalty, "operationsPenalty", 0, 10);
  return Math.round(Math.max(0, Math.min(100, Math.max(scoreA, scoreB) + synergy - controlConflict - contextPenalty - operationsPenalty)));
}

function validateArtifactLink(link, label, runId) {
  text(link, label);
  if (/\p{Cc}/u.test(link) || link.includes("\\") || link.includes("%") || path.isAbsolute(link) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(link)) {
    throw new Error(`${label} is not a valid artifact path`);
  }
  const segments = link.split("/");
  if (
    segments.length < 3
    || segments[0] !== "artifacts"
    || segments[1] !== runId
    || segments.some((segment) => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment) || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} is not a valid artifact path under artifacts/${runId}`);
  }
  return link;
}

function normalizeMethod(method, index, runId) {
  object(method, `methods[${index}]`);
  text(method.name, `methods[${index}].name`);
  if (!METHOD_STATUSES.has(method.status)) throw new Error(`methods[${index}].status is invalid`);
  const result = structuredClone(method);
  result.metrics = object(method.metrics ?? {}, `methods[${index}].metrics`);
  result.artifactLinks = (method.artifactLinks ?? []).map((link, linkIndex) => validateArtifactLink(link, `methods[${index}].artifactLinks[${linkIndex}]`, runId));
  if (["completed", "failed"].includes(method.status)) text(method.exactCommand, `methods[${index}].exactCommand`);
  if (method.exitCode !== undefined && method.exitCode !== null && !Number.isInteger(method.exitCode)) throw new Error(`methods[${index}].exitCode must be an integer or null`);
  if (method.durationMs !== undefined) finite(method.durationMs, `methods[${index}].durationMs`, 0, Number.MAX_SAFE_INTEGER);
  if (!["completed", "failed"].includes(method.status)) text(method.skipReason, `methods[${index}].skipReason`);
  if (method.status === "completed") {
    text(method.version, `methods[${index}].version`);
    if (!Number.isInteger(method.exitCode)) throw new Error(`methods[${index}].exitCode must be an integer`);
    if (method.exitCode !== 0) throw new Error(`methods[${index}] completed method must have exitCode 0`);
    finite(method.durationMs, `methods[${index}].durationMs`, 0, Number.MAX_SAFE_INTEGER);
    if (!result.artifactLinks.length) throw new Error(`methods[${index}].artifactLinks must contain evidence for a completed method`);
  }
  if (method.status === "failed") {
    text(method.version, `methods[${index}].version`);
    if (!Number.isInteger(method.exitCode) || method.exitCode === 0) throw new Error(`methods[${index}] failed method must have a nonzero integer exitCode`);
    finite(method.durationMs, `methods[${index}].durationMs`, 0, Number.MAX_SAFE_INTEGER);
    text(method.skipReason ?? method.reason, `methods[${index}] failed method reason`);
    if (!result.artifactLinks.length) throw new Error(`methods[${index}] failed method must link an error artifact`);
  }
  return result;
}

const DETERMINISTIC_ASSERTIONS = new Set([
  "contains",
  "contains-all",
  "contains-any",
  "contains-json",
  "cost",
  "equals",
  "is-json",
  "javascript",
  "latency",
  "not-contains",
  "regex",
  "starts-with",
  "trajectory:step-count",
  "trajectory:tool-sequence",
  "trajectory:tool-used",
]);
const OUTCOME_ASSERTIONS = new Set(["contains", "contains-all", "contains-any", "contains-json", "equals", "is-json", "not-contains", "regex", "starts-with"]);

function platformForProvider(providerId) {
  const id = String(providerId ?? "").toLowerCase();
  if (id.startsWith("openai:codex")) return "codex";
  if (id.startsWith("anthropic:claude-agent-sdk") || id.startsWith("anthropic:claude-code")) return "claude-code";
  if (id.startsWith("opencode:")) return "opencode";
  return null;
}

function platformsForRows(rows) {
  return [...new Set(rows.map((row) => platformForProvider(row?.provider?.id)).filter(Boolean))].sort();
}

export function verifyPromptfooResult(result) {
  const rows = result?.results?.results;
  if (!Array.isArray(rows)) throw new Error("Promptfoo artifact has no result rows");
  const byLabel = { baseline: [], candidate: [] };
  for (const row of rows) {
    const label = String(row?.provider?.label ?? "").toLowerCase();
    if (label in byLabel) byLabel[label].push(row);
  }
  const baselinePlatforms = new Set(byLabel.baseline.map((row) => platformForProvider(row?.provider?.id)));
  const candidatePlatforms = new Set(byLabel.candidate.map((row) => platformForProvider(row?.provider?.id)));
  if (baselinePlatforms.size !== 1 || candidatePlatforms.size !== 1 || baselinePlatforms.has(null) || candidatePlatforms.has(null) || [...baselinePlatforms][0] !== [...candidatePlatforms][0]) {
    throw new Error("Promptfoo baseline and candidate trials must use the same known platform");
  }
  const platform = [...baselinePlatforms][0];
  if (byLabel.baseline.length < 3 || byLabel.candidate.length < 3) throw new Error("Promptfoo measured evidence requires at least 3 baseline and 3 candidate trials");

  const taskCounts = (group) => group.reduce((counts, row) => {
    const key = `${row.testIdx}:${row.promptId}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const baselineCounts = taskCounts(byLabel.baseline);
  const candidateCounts = taskCounts(byLabel.candidate);
  const countSignature = (counts) => JSON.stringify(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
  if (countSignature(baselineCounts) !== countSignature(candidateCounts)) throw new Error("Promptfoo baseline and candidate require the same number of trials per task");
  if (Object.values(baselineCounts).some((count) => count < 3)) throw new Error("Promptfoo measured evidence requires three trials per task and condition");

  const repeatSignature = (group) => {
    const grouped = new Map();
    for (const row of group) {
      const task = `${row.testIdx}:${row.promptId}`;
      grouped.set(task, [...(grouped.get(task) ?? []), row]);
    }
    return Object.fromEntries([...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([task, taskRows]) => {
      const hasRepeatMetadata = taskRows.every((row) => row?.metadata?.repeat !== undefined);
      const identifiers = taskRows.map((row) => String(hasRepeatMetadata ? row.metadata.repeat : row.id ?? ""));
      if (identifiers.some((id) => !id) || new Set(identifiers).size !== identifiers.length) {
        throw new Error("Promptfoo measured evidence requires distinct repeat identifiers");
      }
      return [task, { kind: hasRepeatMetadata ? "repeat" : "row", identifiers: identifiers.sort() }];
    }));
  };
  const baselineRepeats = repeatSignature(byLabel.baseline);
  const candidateRepeats = repeatSignature(byLabel.candidate);
  for (const task of Object.keys(baselineRepeats)) {
    if (baselineRepeats[task].kind === "repeat" && candidateRepeats[task].kind === "repeat" && JSON.stringify(baselineRepeats[task].identifiers) !== JSON.stringify(candidateRepeats[task].identifiers)) {
      throw new Error("Promptfoo baseline and candidate require matching repeat identifiers");
    }
  }

  for (const row of [...byLabel.baseline, ...byLabel.candidate]) {
    const components = row?.gradingResult?.componentResults;
    if (!Array.isArray(components) || !components.length || components.some((item) => !DETERMINISTIC_ASSERTIONS.has(item?.assertion?.type))) {
      throw new Error("Promptfoo measured evidence requires deterministic assertions");
    }
    if (!components.some((item) => OUTCOME_ASSERTIONS.has(item?.assertion?.type))) {
      throw new Error("Promptfoo measured evidence requires at least one deterministic outcome assertion per trial");
    }
  }

  return {
    pairedBaseline: true,
    deterministicVerifier: true,
    baselineTrials: byLabel.baseline.length,
    candidateTrials: byLabel.candidate.length,
    baselinePasses: byLabel.baseline.filter((row) => row.success === true).length,
    candidatePasses: byLabel.candidate.filter((row) => row.success === true).length,
    platforms: [platform],
  };
}

export function verifyPromptfooSmokeResult(result) {
  const rows = result?.results?.results;
  if (!Array.isArray(rows) || !rows.length) throw new Error("Promptfoo artifact has no result rows");
  for (const row of rows) {
    const components = row?.gradingResult?.componentResults;
    if (!Array.isArray(components) || !components.length || components.some((item) => !DETERMINISTIC_ASSERTIONS.has(item?.assertion?.type))) {
      throw new Error("Promptfoo runtime evidence requires deterministic assertions");
    }
  }
  return {
    runtimeObserved: true,
    trials: rows.length,
    passes: rows.filter((row) => row.success === true).length,
    tokenTotal: result?.results?.stats?.tokenUsage?.total ?? null,
    platforms: platformsForRows(rows),
  };
}

function confidenceFor(evidenceState) {
  return evidenceState === "measured" ? "A" : evidenceState === "mixed" ? "B" : "C";
}

function axesEvidenceState(axes) {
  const states = AXES.map((key) => axes[key].evidenceState);
  if (states.every((state) => state === "measured")) return "measured";
  if (states.some((state) => state !== "estimated")) return "mixed";
  return "estimated";
}

function requireConsistentEvidence(declared, axes, label) {
  const derived = axesEvidenceState(axes);
  if (declared !== derived) throw new Error(`${label}.evidenceState must be ${derived} based on its per-axis evidence`);
}

function requireRuntimeAxisEvidence(axes, runtimeArtifactLinks, label) {
  for (const key of AXES) {
    const axis = axes[key];
    if (axis.evidenceState === "estimated") continue;
    if (!axis.evidence.some((reference) => runtimeArtifactLinks.has(reference))) {
      throw new Error(`${label}.${key} ${axis.evidenceState} axis must cite a verified runtime artifact`);
    }
  }
}

function normalizePlatform(platform, name, pairedPlatforms, runtimePlatforms, runtimeArtifactLinks, runId) {
  object(platform, `platforms.${name}`);
  if (!PLATFORM_STATUSES.has(platform.status)) throw new Error(`platforms.${name}.status is invalid`);
  const result = structuredClone(platform);
  if (platform.status !== "completed") {
    text(platform.reason, `platforms.${name}.reason`);
    delete result.score;
    delete result.bloat;
    delete result.confidence;
    return result;
  }
  if (!EVIDENCE_STATES.has(platform.evidenceState)) throw new Error(`platforms.${name}.evidenceState is invalid`);
  scoreAxes(platform.axes, runId);
  requireConsistentEvidence(platform.evidenceState, platform.axes, `platforms.${name}`);
  requireRuntimeAxisEvidence(platform.axes, runtimeArtifactLinks, `platforms.${name}`);
  if (platform.evidenceState === "measured" && !pairedPlatforms.has(name)) throw new Error(`platforms.${name} cannot be measured without a paired verified outcome for ${name}`);
  if (platform.evidenceState === "mixed" && !runtimePlatforms.has(name)) throw new Error(`platforms.${name} cannot be mixed without a verified runtime artifact for ${name}`);
  return { ...result, ...scoreAxes(platform.axes, runId), confidence: confidenceFor(platform.evidenceState) };
}

function normalizeCombination(combo, index, runId) {
  object(combo, `combinations[${index}]`);
  const members = stringList(combo.members, `combinations[${index}].members`);
  if (members.length < 2) throw new Error(`combinations[${index}].members requires at least two entries`);
  if (!EVIDENCE_STATES.has(combo.evidenceState)) throw new Error(`combinations[${index}].evidenceState is invalid`);
  const result = structuredClone(combo);
  result.artifactLinks = (combo.artifactLinks ?? []).map((link, linkIndex) => validateArtifactLink(link, `combinations[${index}].artifactLinks[${linkIndex}]`, runId));
  if (combo.evidenceState === "estimated") {
    result.score = combinationScore(combo.terms);
    result.confidence = "C";
    return result;
  }
  throw new Error("Measured combinations are not supported until native, A, B, and A+B artifacts are verified");
}

export function safeRunPath(root, id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id)) throw new Error("Invalid run id");
  const resolvedRoot = path.resolve(root);
  const destination = path.resolve(resolvedRoot, `${id}.json`);
  if (!destination.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Run path escapes the run directory");
  return destination;
}

export function normalizeRun(input, verified = {}) {
  const source = object(input, "run");
  if (source.schemaVersion !== 1) throw new Error("schemaVersion must be 1");
  safeRunPath(RUNS_DIR, source.id);
  validDate(source.startedAt, "startedAt");
  validDate(source.finishedAt, "finishedAt");
  if (Date.parse(source.startedAt) > Date.parse(source.finishedAt)) throw new Error("startedAt must not be after finishedAt");
  if (!new Set(["quick", "full"]).has(source.mode)) throw new Error("mode must be quick or full");
  if (!RUN_STATUSES.has(source.status)) throw new Error("status is invalid");
  if (!EVIDENCE_STATES.has(source.evidenceState)) throw new Error("evidenceState is invalid");

  const target = object(source.target, "target");
  text(target.kind, "target.kind");
  text(target.name, "target.name");
  text(target.source, "target.source");
  text(target.version, "target.version");

  if (!Array.isArray(source.methods) || !source.methods.length) throw new Error("methods must contain at least one method");
  const methods = source.methods.map((method, index) => normalizeMethod(method, index, source.id));
  const methodNames = methods.map((method) => method.name);
  if (new Set(methodNames).size !== methodNames.length) throw new Error("Duplicate method name in run");
  const pairedVerified = verified.pairedVerified === true;
  const pairedPlatforms = new Set(verified.pairedPlatforms ?? []);
  const runtimePlatforms = new Set(verified.runtimePlatforms ?? []);
  const runtimeArtifactLinks = new Set(verified.runtimeArtifactLinks ?? []);
  if (source.evidenceState === "measured" && !pairedVerified) throw new Error("A measured run requires a paired verified outcome");
  if (source.evidenceState === "mixed" && verified.runtimeObserved !== true) throw new Error("A mixed run requires a verified runtime artifact");

  const scored = scoreAxes(source.axes, source.id);
  requireConsistentEvidence(source.evidenceState, source.axes, "run");
  requireRuntimeAxisEvidence(source.axes, runtimeArtifactLinks, "run.axes");
  const platformEntries = Object.entries(object(source.platforms ?? {}, "platforms"));
  for (const [name] of platformEntries) if (!PLATFORMS.has(name)) throw new Error(`Unknown platform: ${name}`);
  const platforms = Object.fromEntries(
    platformEntries.map(([name, platform]) => [name, normalizePlatform(platform, name, pairedPlatforms, runtimePlatforms, runtimeArtifactLinks, source.id)]),
  );
  const combinations = (source.combinations ?? []).map((combo, index) => normalizeCombination(combo, index, source.id));
  stringList(source.findings ?? [], "findings");
  text(source.decision, "decision");
  const provenance = object(source.provenance, "provenance");
  for (const key of ["harness", "model", "repositoryRevision", "sandbox", "approvalPolicy", "network"]) text(provenance[key], `provenance.${key}`);
  stringList(provenance.enabledExtensions, "provenance.enabledExtensions");

  if (source.status === "completed" && methods.some((method) => ["failed", "blocked"].includes(method.status))) {
    throw new Error("A completed run cannot contain failed or blocked methods");
  }
  if (source.status === "failed" && !methods.some((method) => method.status === "failed")) throw new Error("A failed run requires at least one failed method");
  if (source.status === "blocked" && !methods.some((method) => method.status === "blocked")) throw new Error("A blocked run requires at least one blocked method");

  return {
    ...structuredClone(source),
    ...scored,
    confidence: confidenceFor(source.evidenceState),
    methods,
    platforms,
    combinations,
  };
}

export function buildIndex(runs) {
  if (!Array.isArray(runs)) throw new Error("runs must be an array");
  const ids = runs.map((run) => run.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate run id in canonical data");
  const ordered = [...runs].sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt) || a.id.localeCompare(b.id));
  return {
    schemaVersion: 1,
    generatedAt: ordered[0]?.finishedAt ?? null,
    runs: ordered,
  };
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll("&", "\\u0026").replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

export function renderDashboard(template, index) {
  const marker = "__AGENT_EVAL_DATA__";
  const hashMarker = "__AGENT_EVAL_SCRIPT_HASH__";
  if (typeof template !== "string" || template.split(marker).length !== 2) throw new Error(`Dashboard template must contain exactly one ${marker} marker`);
  if (template.split(hashMarker).length !== 2) throw new Error("Dashboard template must contain exactly one CSP hash marker");
  const data = safeJson(index);
  const dataIndex = template.indexOf(marker);
  const hashIndex = template.indexOf(hashMarker);
  const withData = `${template.slice(0, dataIndex)}${data}${template.slice(dataIndex + marker.length)}`;
  const adjustedHashIndex = hashIndex + (dataIndex < hashIndex ? data.length - marker.length : 0);
  const scripts = [...withData.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1) throw new Error("Dashboard template must contain one inline script");
  const digest = createHash("sha256").update(scripts[0][1]).digest("base64");
  return `${withData.slice(0, adjustedHashIndex)}'sha256-${digest}'${withData.slice(adjustedHashIndex + hashMarker.length)}`;
}

async function atomicWrite(destination, content) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, destination);
}

async function exclusiveAtomicWrite(destination, content) {
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    const reservation = await open(destination, "wx", 0o600);
    await reservation.close();
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`Run already exists: ${path.basename(destination, ".json")}`);
    throw error;
  }
  try {
    await atomicWrite(destination, content);
  } catch (error) {
    await unlink(destination).catch(() => {});
    throw error;
  }
}

export async function verifyArtifact(runId, link) {
  validateArtifactLink(link, "artifact", runId);
  const lexicalRoot = path.resolve(DATA_ROOT, "artifacts", runId);
  const lexicalPath = path.resolve(DATA_ROOT, link);
  if (!lexicalPath.startsWith(`${lexicalRoot}${path.sep}`)) throw new Error(`Artifact path escapes artifacts/${runId}`);
  const rootDetails = await lstat(lexicalRoot);
  if (rootDetails.isSymbolicLink()) throw new Error(`Artifact run root cannot be a symlink: artifacts/${runId}`);
  if (!rootDetails.isDirectory()) throw new Error(`Artifact run root is not a directory: artifacts/${runId}`);
  const [actualRoot, actualPath] = await Promise.all([realpath(lexicalRoot), realpath(lexicalPath)]);
  if (!actualPath.startsWith(`${actualRoot}${path.sep}`)) throw new Error(`Artifact symlink escapes artifacts/${runId}`);
  const handle = await open(actualPath, "r");
  try {
    const details = await handle.stat();
    if (!details.isFile()) throw new Error(`Artifact is not a file: ${link}`);
    if (details.size > MAX_ARTIFACT_BYTES) throw new Error(`Artifact exceeds the 20 MB limit: ${link}`);
    const content = await handle.readFile();
    if (content.length > MAX_ARTIFACT_BYTES) throw new Error(`Artifact exceeds the 20 MB limit: ${link}`);
    return { content, size: content.length, sha256: createHash("sha256").update(content).digest("hex") };
  } finally {
    await handle.close();
  }
}

function evidenceArtifactLinks(source) {
  const links = [];
  const collectAxes = (axes) => {
    for (const axis of Object.values(axes ?? {})) {
      for (const reference of axis?.evidence ?? []) if (typeof reference === "string" && reference.startsWith("artifacts/")) links.push(reference);
    }
  };
  collectAxes(source.axes);
  for (const platform of Object.values(source.platforms ?? {})) collectAxes(platform?.axes);
  for (const combo of source.combinations ?? []) {
    collectAxes(combo?.axes);
    links.push(...(combo?.artifactLinks ?? []));
  }
  return links;
}

function requireMatchingDigests(supplied, computed, label) {
  object(supplied, `${label} artifactDigests`);
  const suppliedKeys = Object.keys(supplied).sort();
  const computedKeys = Object.keys(computed).sort();
  if (JSON.stringify(suppliedKeys) !== JSON.stringify(computedKeys)) throw new Error(`${label} artifact digest set changed`);
  for (const key of computedKeys) if (supplied[key] !== computed[key]) throw new Error(`${label} artifact digest mismatch: ${key}`);
}

export async function loadAndVerifyRun(source, options = {}) {
  object(source, "run");
  safeRunPath(RUNS_DIR, source.id);
  if (!Array.isArray(source.methods)) throw new Error("methods must be an array");
  const candidate = structuredClone(source);
  const artifacts = new Map();
  const links = [];
  const suppliedRunDigests = candidate.artifactDigests;
  const suppliedMethodDigests = candidate.methods.map((method) => method.artifactDigests);

  for (const [index, method] of candidate.methods.entries()) {
    method.metrics = object(method.metrics ?? {}, `methods[${index}].metrics`);
    delete method.metrics.pairedBaseline;
    delete method.metrics.deterministicVerifier;
    method.artifactDigests = {};
    for (const [linkIndex, link] of (method.artifactLinks ?? []).entries()) {
      validateArtifactLink(link, `methods[${index}].artifactLinks[${linkIndex}]`, candidate.id);
      links.push(link);
    }
  }
  for (const [index, link] of evidenceArtifactLinks(candidate).entries()) {
    validateArtifactLink(link, `evidenceArtifactLinks[${index}]`, candidate.id);
    links.push(link);
  }
  const uniqueLinks = [...new Set(links)];
  if (uniqueLinks.length > MAX_ARTIFACTS) throw new Error(`Run exceeds the ${MAX_ARTIFACTS} artifact limit`);
  let totalBytes = 0;
  for (const link of uniqueLinks) {
    const artifact = await verifyArtifact(candidate.id, link);
    totalBytes += artifact.size;
    if (totalBytes > MAX_TOTAL_ARTIFACT_BYTES) throw new Error("Run artifacts exceed the 50 MB aggregate limit");
    artifacts.set(link, artifact);
  }
  for (const method of candidate.methods) {
    for (const link of method.artifactLinks ?? []) method.artifactDigests[link] = artifacts.get(link).sha256;
  }
  candidate.artifactDigests = Object.fromEntries(uniqueLinks.sort().map((link) => [link, artifacts.get(link).sha256]));
  if (options.requireDigests === true) {
    requireMatchingDigests(suppliedRunDigests, candidate.artifactDigests, "Run");
    candidate.methods.forEach((method, index) => requireMatchingDigests(suppliedMethodDigests[index], method.artifactDigests, `methods[${index}]`));
  }

  let pairedVerified = false;
  let runtimeObserved = false;
  let pairedPlatforms = [];
  let runtimePlatforms = [];
  const runtimeArtifactLinks = [];
  const promptfoo = candidate.methods.find((item) => item.name === "promptfoo" && item.status === "completed");
  const promptfooLink = promptfoo?.artifactLinks?.find((item) => item.endsWith("/promptfoo/result.json"));
  const promptfooConfig = promptfoo?.artifactLinks?.find((item) => item.endsWith("/promptfoo/promptfooconfig.yaml"));
  if (promptfoo && (!promptfooLink || !promptfooConfig)) {
    throw new Error("A completed Promptfoo method requires promptfoo/promptfooconfig.yaml and promptfoo/result.json artifacts");
  }
  if (promptfoo && artifacts.has(promptfooLink) && artifacts.has(promptfooConfig)) {
    const raw = JSON.parse(artifacts.get(promptfooLink).content.toString("utf8"));
    const needsPaired = candidate.evidenceState === "measured" || Object.values(candidate.platforms ?? {}).some((platform) => platform?.evidenceState === "measured");
    const derived = needsPaired ? verifyPromptfooResult(raw) : verifyPromptfooSmokeResult(raw);
    promptfoo.metrics = { ...promptfoo.metrics, ...derived };
    pairedVerified = derived.pairedBaseline === true && derived.deterministicVerifier === true;
    runtimeObserved = true;
    pairedPlatforms = pairedVerified ? derived.platforms : [];
    runtimePlatforms = derived.platforms;
    runtimeArtifactLinks.push(promptfooLink);
  }
  if (candidate.evidenceState === "measured" && !pairedVerified) throw new Error("A measured run requires artifacts/<run-id>/promptfoo/result.json");

  return normalizeRun(candidate, { pairedVerified, runtimeObserved, pairedPlatforms, runtimePlatforms, runtimeArtifactLinks });
}

async function readRuns() {
  await mkdir(RUNS_DIR, { recursive: true });
  const names = (await readdir(RUNS_DIR)).filter((name) => name.endsWith(".json")).sort();
  const runs = [];
  for (const name of names) {
    const location = path.join(RUNS_DIR, name);
    const source = JSON.parse((await readBoundedFile(location, 2_000_000, `Canonical run ${name}`)).toString("utf8"));
    assertCanonicalFilename(name, source.id);
    runs.push(await loadAndVerifyRun(source, { requireDigests: true }));
  }
  return runs;
}

async function readBoundedFile(location, maxBytes, label) {
  const handle = await open(location, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const details = await handle.stat();
    if (!details.isFile()) throw new Error(`${label} must be a regular file`);
    if (details.size > maxBytes) throw new Error(`${label} exceeds the ${maxBytes} byte limit`);
    const content = await handle.readFile();
    if (content.length > maxBytes) throw new Error(`${label} exceeds the ${maxBytes} byte limit`);
    return content;
  } finally {
    await handle.close();
  }
}

export function assertCanonicalFilename(name, runId) {
  if (name !== `${runId}.json`) throw new Error(`Canonical filename does not match run id: ${name}`);
}

async function writeOutputs(runs) {
  const index = buildIndex(runs);
  const template = await readFile(TEMPLATE_PATH, "utf8");
  await atomicWrite(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`);
  await atomicWrite(DASHBOARD_PATH, renderDashboard(template, index));
  return index;
}

async function recordRun(inputPath) {
  if (!inputPath) throw new Error("Usage: agent-eval.mjs record <run.json>");
  const sourcePath = path.resolve(inputPath);
  const run = await loadAndVerifyRun(JSON.parse((await readBoundedFile(sourcePath, 2_000_000, "Run JSON")).toString("utf8")));
  const destination = safeRunPath(RUNS_DIR, run.id);
  await exclusiveAtomicWrite(destination, `${JSON.stringify(run, null, 2)}\n`);
  const runs = await readRuns();
  await writeOutputs(runs);
  return run;
}

function detectCommand(name, args = ["--version"]) {
  const result = spawnSync(name, args, { encoding: "utf8", timeout: 10_000, maxBuffer: 65_536, env: { PATH: process.env.PATH ?? "" } });
  if (result.error?.code === "ENOENT") return { name, status: "unavailable", skipReason: `${name} is not on PATH` };
  if (result.error?.code === "ETIMEDOUT") return { name, status: "timeout", skipReason: `${name} did not answer within 10 seconds` };
  const output = (`${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().split("\n")[0] ?? "").slice(0, 256);
  return {
    name,
    status: result.status === 0 && !result.error ? "available" : "failed",
    ...(result.status === 0 && !result.error ? { executable: executablePath(name) } : {}),
    exitCode: result.status,
    version: output || "unknown",
    ...(result.error ? { skipReason: `${name} version check failed` } : {}),
  };
}

function executablePath(name) {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(directory, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function detectPluginEval() {
  const result = detectCommand("plugin-eval", ["--help"]);
  if (result.status !== "available") return result;
  try {
    const executable = realpathSync(executablePath("plugin-eval"));
    const root = path.dirname(path.dirname(executable));
    const packageVersion = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
    const manifestPath = path.join(root, ".codex-plugin", "plugin.json");
    const bundleVersion = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")).version : null;
    return { ...result, version: bundleVersion && bundleVersion !== packageVersion ? `${packageVersion} (plugin ${bundleVersion})` : packageVersion };
  } catch {
    return { ...result, version: "unknown", skipReason: "Plugin Eval package version could not be read" };
  }
}

export function detectEvaluators() {
  return [
    detectPluginEval(),
    detectCommand("promptfoo"),
    detectCommand("harbor"),
    detectCommand("inspect"),
  ];
}

async function main(args) {
  const [command, value] = args;
  if (command === "record") {
    const run = await recordRun(value);
    console.log(`Recorded ${run.id}: ${run.score}/100 (${run.evidenceState}, confidence ${run.confidence})`);
    return;
  }
  if (command === "render") {
    const index = await writeOutputs(await readRuns());
    console.log(`Rendered ${index.runs.length} run(s) to ${DASHBOARD_PATH}`);
    return;
  }
  if (command === "check") {
    const runs = await readRuns();
    const template = await readFile(TEMPLATE_PATH, "utf8");
    renderDashboard(template, buildIndex(runs));
    console.log(`Valid: ${runs.length} run(s)`);
    return;
  }
  if (command === "detect") {
    console.log(JSON.stringify(detectEvaluators(), null, 2));
    return;
  }
  throw new Error("Usage: agent-eval.mjs <record RUN.json|render|check|detect>");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
