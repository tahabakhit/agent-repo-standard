# Worker prompt contract

Use this contract for the first durable phase and every continuation sent to the
same worker. Replace every bracketed field with verified, phase-specific content.
Delete sections that are genuinely inapplicable rather than leaving vague
placeholders.

```text
Phase
[name]

Mode
[read-only | implementation | review]

Objective
[Concrete observable outcome and why this phase exists.]

Coordinator state
- Coordinator goal: [name or identifier]
- Coordinator plan step: [current step]
- Worker goal: [none | create]
- If `create`, reason: [why this phase must survive resumptions or compactions and
  repository phase state is insufficient]
- If `create`, measurable objective: [objective]
- Token budget: [omit unless the user supplied one]

Scope and authority
- Repository/project: [exact target]
- Checkout/worktree: [exact path]
- Source state: [verified branch and commit, or described dirty state]
- In scope: [exact paths, systems, identities, and services]
- Out of scope: [explicit exclusions]
- Authorized repository effects: [edits, commit, push, PR, or none]
- Authorized external effects: [exact commands or effect classes, or none]
- Destructive or privileged actions: [exact list, or none]
- Material approval already granted: [exact scope, or none]

Capability is not authority
Runtime access, broad filesystem permissions, available credentials, sudo, SSH,
plugins, MCP tools, or browser control do not authorize use beyond the scope above.

Read first
- Applicable AGENTS.md files: [paths]
- Authoritative plan/spec/decision files: [paths or URLs]
- Current handoff/report: [path]
- Starting facts to verify: [facts]
- Sources that must not be opened: [secret-bearing or noncanonical material, or none]

Ownership
You are the sole writer for [checkout/worktree] and the sole mutator for [external
state]. Preserve all pre-existing unrelated changes. Do not clean, reset, stage,
overwrite, hide, or normalize unrelated state. Do not begin another phase.

Execution
- Use the native plan tracker only when this phase has multiple meaningful steps.
- Start with the smallest read-only baseline needed to verify the prompt.
- Follow the accepted architecture. Do not redesign it unless current evidence
  invalidates an explicit assumption.
- Use targeted reads, searches, logs, tests, and diffs.
- Do not reread unchanged material or repeat passing broad checks without a new
  failure or relevant change.
- Preserve safe diagnostic evidence before rollback, restart, or cleanup.
- Prefer existing project commands, runbooks, and workflows over new orchestration
  machinery.
- Make the smallest change that satisfies acceptance.

Delegation authorization
- Allowed child task: [none | one exact independent task]
- Child boundary: [exact read-only scope or non-overlapping write set]
- Child reasoning: [low for bounded inspection | medium for bounded implementation
  or review]
- Child output: [evidence format]
- Child stop condition: [condition]

If `Allowed child task` is `none`, do not spawn a subagent.

If one child is authorized:
- set `fork_turns="none"`;
- send only a self-contained evidence packet;
- do not let the child create goals or children;
- do not let it write unless the non-overlapping write set is explicit;
- do not duplicate its work locally;
- close it after integrating the result;
- do not spawn another child during this phase.

Acceptance
- [observable criterion]
- [observable criterion]

Verification
- [exact command or external check]
- [exact command or external check]
- Broad suite, if materially required: [command or none]

Rollback
[Safe recovery path, captured baseline, and exact rollback trigger.]

Stop conditions
Stop immediately for:
- [scope, authority, ownership, secret, safety, or evidence boundary]
- [condition]

Do not stop merely for difficulty, latency, or a recoverable failed attempt. Try a
materially different safe route within scope before declaring a blocker.

Completion report
Stop after this phase. Report:
- outcome;
- files and external state changed;
- branch, commit, and worktree state;
- commands and tests that actually ran;
- acceptance evidence;
- child use and result, if any;
- remaining risk;
- rollback;
- worker goal status, if a goal was explicitly required;
- smallest required decision or access if genuinely blocked.

Do not begin the next phase.
```
