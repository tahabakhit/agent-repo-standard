---
name: asturlab-orchestrate
description: Own complex work through discovery, planning, implementation, review, and verification. Use only when the user explicitly invokes $asturlab-orchestrate with an idea, plan, objective, or other context.
---

Own the requested outcome from initial context through verified completion. Use the
least machinery that safely achieves the result. Planning, delegation, and review
are tools for the journey, not goals by themselves.

## Invocation contract

Treat this as the complete entry point:

```text
$asturlab-orchestrate <idea, plan, objective, constraints, or other context>
```

Do not ask the user to invoke `/goal` or `/plan`. Explicit invocation requests that
the coordinator:

1. create or reuse one compatible coordinator goal;
2. create and maintain the native execution plan when the journey has multiple
   meaningful steps;
3. inspect relevant context and resolve recoverable uncertainty;
4. choose the smallest useful execution topology;
5. coordinate implementation, review, correction, and verification;
6. continue until the requested outcome is achieved or genuinely blocked.

Explicit invocation authorizes:

- coordinator goal and plan tracking;
- read-only discovery and research;
- ordinary reversible work inside the stated scope;
- one durable worker when isolation, a long-running phase, or a deliberate context
  boundary materially improves execution.

Invocation does not automatically authorize subagents, multiple workers, pushes,
deployments, publication, deletion, spending, access or permission changes,
credential rotation or disclosure, network changes, live-system impact, or
third-party communication. Those require either clear authorization in the user's
request or a focused material gate.

Treat available permissions as capability, not authority. A permissive runtime
configuration never broadens the user's request.

If the user narrows the request to planning, research, review, diagnosis, or another
partial journey, stop at that boundary.

## 1. Bootstrap automatically

Read the current goal. Reuse it when compatible; create one when absent by distilling
the requested outcome and measurable success condition. Do not overwrite or complete
an unrelated goal merely to start this workflow. Omit a token budget unless the user
supplied one.

Use one coordinator goal for the journey. Do not create worker-local goals by
default. A durable worker may create a goal only when the worker prompt explicitly
requires it because the phase is expected to span resumptions or compactions and the
repository's phase state is insufficient.

Create the native plan immediately when there are multiple meaningful steps. Keep at
most one coordinator step in progress. Update status only when evidence changes.

Start read-only. Inspect applicable `AGENTS.md` files, repository and worktree state,
authoritative plans and decisions, tools, and relevant external state. Determine:

- objective and success;
- explicit exclusions;
- source state and dependencies;
- repository and external-state ownership;
- authorized effects and material gates;
- acceptance criteria;
- verification;
- rollback and stop conditions.

## 2. Shape the journey

Resolve recoverable facts from the environment instead of asking the user. Ask one
focused question only when the answer materially changes architecture, authority,
cost, scope, risk, or outcome, and include a recommendation.

Break execution into the smallest vertical phases that each leave an observable,
verifiable result. For every phase define:

- objective and why the phase exists;
- exact scope and exclusions;
- dependencies and verified source state;
- one repository writer and one external-state mutator;
- authorized external effects;
- acceptance criteria;
- proportionate verification;
- rollback;
- stop condition.

Avoid empty foundation, cleanup, polish, future-proofing, or speculative phases.
Do not redesign an accepted architecture unless current evidence invalidates it.

## 3. Choose the execution topology

Use this escalation order:

1. **Coordinator only, default:** planning, research, bounded implementation, or
   review that does not need isolation or durable background execution.
2. **One durable worker:** an isolated writer, long-running phase, remote execution,
   or a deliberate context boundary.
3. **One bounded subagent:** a named independent side task that can run without
   blocking the coordinator's immediate next action.
4. **Multiple durable workers, exceptional:** independent write streams with
   non-overlapping checkout and external-state ownership.

Do not escalate merely because the task is large, detailed, or important. Record the
specific reason each worker or subagent improves execution.

Group dependent phases into one write stream and continue them in the same durable
worker after verification. Start a new worker only for an independent stream or a
deliberate fresh-context boundary.

## 4. Delegate economically

Read [native orchestration](references/native-codex-orchestration.md) before
dispatching. Use [the worker prompt contract](references/worker-prompt.md) for every
durable phase or continuation.

A subagent may be used only when the coordinator plan names its independent task.
At most one child may be open at a time.

For every `spawn_agent` call:

- set `fork_turns="none"` unless a specific small number of recent turns is
  demonstrably required;
- provide a small, self-contained evidence packet with the objective, exact paths,
  constraints, known facts, acceptance criteria, output format, and stop condition;
- use Low reasoning for bounded read-only inspection;
- use Medium reasoning for bounded implementation or review;
- do not inherit High reasoning merely because the coordinator is planning at High;
- prohibit the child from creating goals or children;
- keep write scope read-only unless a precise non-overlapping write boundary is
  explicitly authorized;
- close the child when its result has been integrated before creating another.

Do not delegate immediate blocking work when the coordinator's next action depends
on it. Do not duplicate a delegated task locally. While a child runs, perform useful
non-overlapping work. Wait sparingly and only when its result is required.

The coordinator owns synthesis, verification, and the final decision. Delegated
output is evidence, not proof.

## 5. Resolve material gates

Proceed autonomously through read-only checks, routine reversible local work, and
proportionate verification already inside the approved scope.

After the read-only baseline, consolidate related material actions into one focused
gate when possible. A gate must state:

- the exact proposed change;
- affected systems and identities;
- expected impact;
- validation and rollback;
- what remains explicitly unauthorized.

Approval for one action never authorizes another.

## 6. Execute and coordinate

For project work, resolve the saved project before creating a task. Prefer a Codex
worktree for isolated writes. Use the local checkout only when its dirty state is
intentionally in scope and one writer is guaranteed. Use projectless tasks only when
no repository belongs to the work.

Keep one writer for each checkout and one mutator for each external system. Secret,
identity, permission, network, and live-service mutations must not overlap.

Use targeted reads, searches, logs, tests, and diffs. Do not repeatedly reread
unchanged files, rerun passing broad suites, or repeat reviews without a new failure
or risk. Preserve safe diagnostic evidence before rollback or cleanup.

Continue dependent phases in the same worker only after the current phase is
accepted. Send focused corrections to the same worker. Interrupt only for scope,
safety, authority, or ownership violations.

## 7. Review and converge

Independently verify actual checkout and external state after every phase. Check:

- acceptance criteria;
- commands and tests that actually ran;
- Git branch, commit, diff, and worktree state;
- preservation of unrelated work;
- scope and writer ownership;
- secret and generated-file hygiene;
- external-state effects;
- rollback viability.

Use one independent review when risk or complexity warrants it. Prefer a fresh
bounded reviewer over several overlapping reviewers. Final acceptance remains with
the coordinator.

Run broad validation once when it materially validates the phase. Repeat it only
after relevant changes or a concrete failure.

## 8. Close the outcome

Confirm final repository and external state. Capture durable decisions, reports,
runbooks, and handoffs using existing project conventions.

Report:

- achieved outcome;
- files, commits, and external state changed;
- verification that passed;
- material limitations or residual risk;
- rollback;
- any genuinely blocked work.

Complete the coordinator goal only when the requested outcome and required
verification are complete. Use the goal tool's actual blocked criteria; difficulty,
latency, or missing convenience is not enough. Leave background tasks unarchived
unless cleanup was requested or the workflow requires it.
