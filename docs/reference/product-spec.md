# Agent Eval product specification

Status: approved
Date: 2026-07-17
Owner: Taha Bakhit

## 1. Problem

The current cross-harness scorecard is useful for triage, but many entries are based on source review rather than controlled runs. The workflow is not yet executable as one Codex command, raw evidence is not normalized, and the published score does not always make the distinction between measured and estimated evidence prominent enough.

Agent Eval will turn the documented evaluation method into a repeatable Codex workflow and an offline results dashboard.

## 2. Outcome

From a Codex chat, the user invokes:

```text
$agent-eval:evaluate-all <path-or-url> --mode quick|full --platforms codex,claude-code,pi,hermes,opencode [--with <other-target>]
```

The current Codex task remains the orchestrator. It delegates independent evaluation lanes to subagents, verifies their artifacts, computes scores deterministically, writes a canonical run record, renders a friendly offline dashboard, and updates the personal wiki with a concise summary.

Codex plugins expose workflows as skills. The verified explicit invocation is `$agent-eval:evaluate-all`, not a custom slash command. A matching natural-language request can also trigger the skill.

## 3. Goals

1. Evaluate a local skill, plugin, CLI/tool, repository convention, harness, or selected combination.
2. Separate structural/static claims from measured behavioral outcomes.
3. Support platform-specific results for Codex, Claude Code, Pi, Hermes, and OpenCode without hiding adapter gaps in an average.
4. Preserve exact commands, versions, configurations, logs, and raw outputs.
5. Make missing, skipped, failed, estimated, and measured evidence visibly different.
6. Keep the implementation portable, local-first, inspectable, and easy to remove.
7. Generate a self-contained offline web dashboard with sortable scores and detailed evidence.

## 4. Non-goals

1. Reimplement Promptfoo, Plugin Eval, Harbor, or Inspect AI.
2. Install every evaluator or run every lane on every target.
3. Provide a background daemon, database, hosted service, account system, or remote API.
4. Let the web page execute shell commands or silently start Codex tasks.
5. Claim a measured outcome score without a paired baseline/candidate task run.
6. Generate every possible tool combination. Combinations are explicit and opt-in.
7. Make a universal model leaderboard. This evaluates harness/tool fit for a defined job.

## 5. Product shape

Create a separate repository:

```text
/Users/tahabakhit/dev/projects/agents/tools/agent-eval
```

The repository is both a Codex plugin and the canonical result ledger.

```text
agent-eval/
  .codex-plugin/plugin.json
  skills/evaluate-all/SKILL.md
  scripts/check.mjs
  scripts/record.mjs
  scripts/render.mjs
  tests/
  web/template.html
  data/index.json
  data/runs/.gitkeep
  artifacts/.gitkeep
  dist/.gitkeep
  docs/reference/product-spec.md
  docs/decisions/adrs/
  AGENTS.md
  README.md
  package.json
```

No React, Vite, frontend framework, database, API server, or runtime dependency is required for the first version. Node.js standard-library scripts validate JSON, calculate scores, build the index, and render one self-contained HTML file.

## 6. Invocation and orchestration

### 6.1 Command wrapper

`skills/evaluate-all/SKILL.md` is the Codex-facing workflow. Explicit invocation uses the installed skill name; the deterministic script remains a private implementation detail.

### 6.2 Main task responsibilities

Only the main Codex task may:

1. create the run ID and run directory;
2. decide which lanes are applicable;
3. queue up to three evaluator subagents at once;
4. validate each lane's result against the method-result schema;
5. resolve contradictions and reject unsupported claims;
6. call the deterministic score calculator;
7. update the ledger, dashboard, and wiki summary.

Evaluator subagents write only their assigned method artifact. They do not modify the canonical ledger, compute the overall score, or update the wiki.

### 6.3 Modes

| Mode | Required lanes | Outcome claim |
|---|---|---|
| `quick` | source/manual review plus Plugin Eval when applicable; Promptfoo configuration/smoke where a valid test exists | Estimated or mixed |
| `full` | paired baseline/candidate Promptfoo trials; Harbor when deterministic repository verification is applicable; optional Inspect deep lane | Measured only when paired outcome evidence succeeds |

If full mode lacks a private task pack or deterministic success criteria, the outcome lane is `blocked: missing task pack`. It must not be silently replaced by an LLM opinion.

## 7. Evaluation lanes

### 7.1 Plugin Eval

Job: Codex-local skill/plugin structure, trigger/invocation/deferred token budgets, static checks, and optional Codex benchmark artifacts.

Applicability: local Codex skill or plugin only.

Verified executable on the development machine at specification time (runtime uses `detect`, not this path):

```text
/opt/homebrew/bin/plugin-eval
```

Default command:

```text
plugin-eval analyze <target> --format json --output <artifact>
```

Plugin Eval's score remains a method-local score. The aggregate calculator does not reinterpret it as cross-harness outcome lift.

### 7.2 Promptfoo

Job: paired harness behavior, invocation/routing, deterministic and trace assertions, latency, tokens, cost, and repeated outcomes.

Applicability: native providers for Codex SDK/app-server, Claude Agent SDK, and OpenCode SDK; custom providers may later support Pi and Hermes.

Verified executable and version on the development machine at specification time (runtime uses `detect`, not this path):

```text
/opt/homebrew/bin/promptfoo
0.121.19
```

Default run contract:

```text
promptfoo validate -c <config>
promptfoo eval -c <config> --repeat 3 --no-cache --no-share --max-concurrency 1 --output <result.json>
```

Every mutating task runs in a disposable worktree, container, or copied fixture. A direct working directory is allowed only for read-only tasks.

### 7.3 Harbor

Job: deterministic repository-task correctness, isolated execution, skill provenance, pass-rate lift, and combination trials.

Applicability: full mode with executable repository tasks. Harbor is currently unavailable locally and must be reported as unavailable until separately approved and installed.

Default status in version 1: optional adapter contract plus truthful availability detection. Do not install it merely to populate a card.

### 7.4 Inspect AI

Job: advanced custom agents/scorers, deep transcripts, intervention research, or custom Pi/Hermes bridge experiments.

Applicability: explicit `deep` request only. It overlaps Promptfoo and Harbor, so it is evidence rather than a third independent vote.

Default status in version 1: optional adapter contract plus truthful availability detection.

### 7.5 Independent source and safety review

Job: verify target identity, version, license, installation/removal surface, platform support, maintenance signals, context surface, ownership collisions, and unsafe behavior.

This lane may use primary documentation and repository source. Community claims are leads, not scored proof.

## 8. Scoring model

Keep the existing nine-axis method. Each axis is 0 to 5.

| Axis | Weight | Meaning |
|---|---:|---|
| `V` | 25 | Outcome value |
| `U` | 10 | Unique lift over the native harness |
| `E` | 10 | Evidence strength |
| `X` | 10 | Cross-agent portability |
| `R` | 10 | Reliability and reproducibility |
| `S` | 10 | Safety and governance |
| `M` | 5 | Maintenance health |
| `F` | 10 | Platform fit |
| `C` | 10 | Context and operations efficiency |

```text
score = round(
  25*V/5 + 10*U/5 + 10*E/5 + 10*X/5 + 10*R/5
  + 10*S/5 + 5*M/5 + 10*F/5 + 10*C/5
)
```

`Bloat = 5 - C`. Repository size is recorded but is not itself a bloat score.

### 8.1 Evidence state

| State | Meaning |
|---|---|
| `measured` | Every axis cites applicable runtime evidence, with same-platform paired baseline/candidate runs and valid task-level verification |
| `mixed` | Some axes measured; others use current source/static evidence |
| `estimated` | Source/static/manual evidence only |

The dashboard displays evidence state before the numeric score.

Every `measured` or `mixed` axis must cite an applicable verified runtime artifact. A source citation alone cannot promote an axis above `estimated`. Paired Promptfoo proof certifies only the one known platform shared by its baseline and candidate rows.

### 8.2 Confidence

Confidence is computed separately and cannot be typed directly by an evaluator agent.

| Confidence | Minimum evidence |
|---|---|
| A | Controlled local trials or deterministic tests inspected directly |
| B | Current primary source plus reproducible tests/evidence |
| C | Current source/docs inspected without independent outcome run |
| D | Inventory/link-level triage only |

An unmeasured combination is capped at C. A failed or unavailable behavioral lane cannot yield `measured` state.

### 8.3 Method reconciliation

Methods own distinct claims:

- Harbor/deterministic task tests own repository-task correctness when available.
- Promptfoo owns routing, latency, token/cost, trace assertions, and cross-harness paired outcomes.
- Plugin Eval owns Codex-local structure and static token-budget findings.
- Inspect adds diagnostics or custom-adapter evidence.

The system does not average evaluator-local scores as independent votes.

## 9. Platform-specific evaluation

Store a separate record for each requested platform:

```text
codex | claude-code | pi | hermes | opencode
```

Each platform record contains status, adapter, axes, score, evidence state, confidence, reasons, and artifacts. Unsupported adapters remain `unsupported` or `not-run`; they are never converted to zero or averaged into the candidate score.

Re-score `V`, `U`, `F`, and `C` by platform. Re-score other axes only when the adapter changes the evidence, safety, or reliability.

## 10. Combination evaluation

The `--with` option evaluates only the requested combination. Version 0.1 records the explicit term-based estimate below and confidence C. It rejects `mixed` or `measured` combination records until a native/A/B/A+B adapter exists, preventing a global paired result from being reused as combination proof.

The future measured adapter must run the same task pack under:

```text
native baseline
candidate A
candidate B
candidate A+B
```

The measured combination result is the combined run's outcome, not the average of A and B.

Before measured runs exist, the deterministic triage formula is:

```text
combo = clamp(
  max(scoreA, scoreB)
  + synergy
  - controlConflict
  - contextPenalty
  - operationsPenalty,
  0,
  100
)
```

The estimated result must expose every term and remain confidence C or lower.

## 11. Canonical data

### 11.1 Run record

Each `data/runs/<run-id>.json` contains:

- schema version, ID, start/end times, mode, status;
- target kind/name/source/version/commit;
- requested platforms and combination;
- evaluator versions and exact commands;
- method statuses, exit codes, durations, metrics, skip reasons, artifact paths;
- nine axes with numeric value, evidence state, reason, and supporting artifact IDs;
- computed overall score, confidence, and bloat;
- per-platform results;
- combination results;
- findings, unresolved facts, decision, and removal plan;
- provenance: harness, model, repository revision, sandbox, approvals, network, enabled plugin/skill set.

### 11.2 Artifact policy

Raw evaluator outputs live under `artifacts/<run-id>/<method>/` and are git-ignored by default. Canonical compact run JSON and the generated index are tracked only after human review. No secret values, raw environment dumps, cookies, tokens, or private debugging logs may enter the run record or wiki.

## 12. Offline web app

The renderer produces `dist/index.html`, a self-contained local page with embedded normalized data.

### 12.1 Dashboard

- score, evidence-state, and confidence summary cards;
- platform tabs;
- search, platform/evidence filters, and sortable candidate table;
- clear `Measured`, `Mixed`, `Estimated`, `Failed`, `Skipped`, and `Unavailable` badges;
- last-run date and target version.

### 12.2 Evaluation detail

- prominent evidence state and decision;
- nine horizontal axis bars with reasons and evidence links;
- per-platform matrix;
- method cards showing exact command, version, status, exit code, duration, and raw artifact link;
- combination result and its explicit penalties/lift;
- unresolved facts and removal plan.

### 12.3 New evaluation

A form accepts target, kind, platforms, mode, and optional combination. It copies the correct Codex command. The page does not execute it.

Use semantic HTML, visible keyboard focus, high contrast, no `innerHTML` for untrusted values, and no third-party script/CDN.

## 13. Threat model and controls

### Trust boundaries

1. target path, URL, repository content, and skill instructions;
2. evaluator and model output;
3. subprocess commands and environment variables;
4. generated JSON rendered into HTML;
5. artifacts promoted into the wiki.

### Assets

Local source repositories, Codex/Claude authentication, 1Password access, shell environment, private task packs, evaluation integrity, and the personal wiki.

### Required controls

1. Resolve and validate local paths; reject traversal outside the explicitly selected target/run roots.
2. Use argument arrays, never shell interpolation, for target-derived subprocess arguments.
3. Allowlist evaluator executables and subcommands.
4. Use timeouts, attempt limits, token/cost ceilings, and concurrency maximum three.
5. Start read-only, approvals denied, and network disabled where the evaluator supports it.
6. Use disposable workspaces for every write-capable task.
7. Pass only allowlisted environment variable names. Never capture or print values.
8. Treat repository text and model output as untrusted data, not orchestration instructions.
9. Parse and schema-validate every method result before aggregation.
10. Render user/model text with `textContent`, not `innerHTML`.
11. Keep the dashboard offline. Add a strict Content Security Policy and no remote assets.
12. Record failure and skip states. Never coerce errors into scores.

## 14. Failure behavior

| Condition | Required result |
|---|---|
| Evaluator not installed | `unavailable` with verified detection command |
| Target not applicable | `not-applicable` with reason |
| Missing task pack | `blocked` for measured outcome lane |
| Evaluator exits nonzero | `failed`, preserve stderr artifact after redaction |
| Result schema invalid | reject lane; do not aggregate it |
| Conflicting findings | main task records conflict and lowers confidence |
| Budget exceeded | stop remaining paid/repeated trials and preserve partial evidence |
| Unsafe target behavior | stop execution, record safety finding, do not retry with broader permissions |

## 15. Test strategy

Implementation follows test-driven development.

### Unit tests

1. run-record schema accepts a valid fixture and rejects invalid status/evidence combinations;
2. nine-axis formula and bloat calculation;
3. confidence caps for estimated, failed, unsupported, and combination records;
4. combination formula boundaries and explicit term preservation;
5. deterministic index generation and stable sorting;
6. HTML escaping and no raw untrusted markup;
7. command/path validation and allowlist behavior.

### Integration tests

1. real `plugin-eval analyze` on a fixture skill produces a normalized method result;
2. real Promptfoo configuration validation;
3. one read-only Promptfoo Codex app-server smoke run on a disposable fixture;
4. missing Harbor and Inspect are recorded as unavailable, not failures or fabricated scores;
5. render a run and validate the self-contained dashboard file.

### Browser checks

Open the dashboard in a real browser and verify:

- layout at desktop and narrow widths;
- filters, sorting, tabs, details, and command copy;
- keyboard focus and readable contrast;
- no network requests;
- no console errors;
- artifact links resolve locally.

## 16. Acceptance criteria

1. `$agent-eval:evaluate-all <target> ...` is visible after plugin installation and starts the current-task orchestration workflow.
2. The main task launches one subagent per applicable method, queues above three workers, and remains the only ledger/wiki writer.
3. Actual evaluator versions, exact commands, exit codes, durations, and artifacts are recorded.
4. Plugin Eval and Promptfoo execute through their real installed CLIs.
5. Missing, skipped, not-applicable, blocked, and failed methods remain distinct.
6. No run is labeled measured without a successful paired outcome test.
7. Per-platform scores and explicit estimated combinations are supported without unsupported-host averaging; measured combinations fail closed until their four-way adapter exists.
8. The deterministic checker validates schema, scoring, confidence caps, and a representative combination.
9. The self-contained dashboard opens offline, filters records, shows section details, and links artifacts.
10. The wiki receives a concise generated summary with evidence state, score, decision, source links, and canonical run path.
11. No secrets or inherited environment dump appear in source, artifacts, dashboard, or wiki.
12. Tests, browser verification, Plugin Eval tests, and `npm audit` pass before delivery.

## 17. Delivery sequence

1. Approve this specification and its architecture.
2. Initialize the standalone repository and write failing unit tests.
3. Implement schema, calculator, record/index builder, and renderer.
4. Implement the Codex plugin command and orchestration skill.
5. Implement Plugin Eval and Promptfoo method adapters.
6. Add truthful Harbor/Inspect availability contracts without installing them.
7. Run integration and browser verification.
8. Install the local plugin, verify `$agent-eval:evaluate-all`, and run one real quick evaluation.
9. Update the cross-harness wiki pages, correcting provisional Plugin Eval claims and linking measured evidence.

## 18. Approval decisions

Approval of this specification confirms these defaults:

1. repository name and path: `agent-eval` under the agents/tools directory;
2. verified namespaced skill invocation: `$agent-eval:evaluate-all`;
3. zero-dependency Node standard-library implementation and self-contained offline HTML;
4. Plugin Eval plus Promptfoo as current default executable lanes;
5. Harbor and Inspect as optional unavailable/deep adapters until separately justified;
6. existing V/U/E/X/R/S/M/F/C scorecard retained;
7. canonical JSON in the repo, concise generated summaries in the wiki;
8. no browser-to-shell execution in version 1.
