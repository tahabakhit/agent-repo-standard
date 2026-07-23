# Native Codex orchestration

Read this reference before dispatching, monitoring, correcting, or accepting
durable workers or native subagents.

## Planning and goals

- `$amanar-orchestrate` initializes or reuses one coordinator goal and the native plan.
  Do not send the user to `/goal` or `/plan`.
- Reuse a compatible goal. Preserve an unrelated unfinished goal and surface the
  collision rather than overwriting or completing it.
- Omit a token budget unless the user supplied one.
- Keep at most one coordinator plan step in progress.
- The coordinator goal is the default persistent journey state.
- Do not create goals for subagents.
- Do not create a durable worker goal unless the worker prompt explicitly marks
  `Worker goal: create` and explains why repository phase state is insufficient.
- Mark a goal complete only after the objective and required verification pass.
  Follow the goal tool's repeated-blocker rule exactly.

## Topology decision

Use the smallest topology that works:

1. coordinator only;
2. one durable worker;
3. one bounded subagent;
4. multiple durable workers only for independent non-overlapping streams.

A task's size, importance, or requested thoroughness does not by itself justify
delegation. Record the concrete benefit: isolation, independent context, parallel
side work, remote execution, or long-running durability.

Exactly one writer owns a checkout. Exactly one mutator owns a live system or
credential boundary at a time.

## Durable tasks

1. Resolve the saved project before creating a project task.
2. Choose the environment deliberately:
   - **Worktree:** isolated writer or independent stream.
   - **Local:** current dirty state is intentionally included and no writer can
     overlap.
   - **Projectless:** no repository belongs to the work.
3. Give the task a clear title and retain its task, host, and cursor identifiers.
4. Use the worker prompt contract for the initial phase and every continuation.
5. Continue dependent phases in the same task after coordinator acceptance.
6. Start another durable task only for an independent stream or deliberate
   fresh-context boundary.
7. If task creation is unavailable, return the complete worker prompt for manual
   creation. Do not silently change topology.

A durable worker does not automatically receive authority for external effects.
The prompt must list every authorized mutation and every prohibited boundary.

## Subagents

Use a subagent only for a named, independent side task that materially advances the
main task without blocking the coordinator's immediate next action.

At most one child may be open at a time. Close it after integration before spawning
another.

Every child request must include:

- `fork_turns="none"` unless a specific small recent-turn fork is necessary;
- one objective;
- exact file, repository, or system scope;
- read/write boundary;
- relevant facts and invariants;
- required evidence and output format;
- acceptance criteria;
- stop condition;
- explicit reasoning effort.

Reasoning defaults:

- Low: bounded read-only inventory, exact-path lookup, narrow source inspection,
  or mechanical comparison.
- Medium: bounded implementation, debugging, or review.
- High: keep in the root for architecture, synthesis, security decisions, or final
  acceptance. Do not inherit it into a child by omission.

Children must not create goals or children. They are read-only unless the
coordinator explicitly assigns a non-overlapping write set. Do not give a child the
complete parent conversation merely for convenience.

Do not delegate the critical-path action the coordinator needs immediately. Do not
redo the child's task locally. Perform useful non-overlapping work while it runs.

## Monitoring and correction

- Use compact task snapshots and preserve cursors so final text is not repeated.
- Wait only when the result is required for the next critical-path action.
- Do not repeatedly poll a running worker or child.
- Ordinary commentary is progress, not a reason to interrupt.
- Read a full task only to diagnose missing evidence, ambiguous state, or a
  correction that cannot be written from the compact snapshot.
- Send focused corrections to the existing worker.
- Interrupt only for scope, safety, authority, ownership, or secret-handling
  violations.

## Context and tool discipline

- Use targeted file ranges, searches, logs, tests, and diffs.
- Do not reread unchanged sources or repeat passing broad checks without new risk.
- Keep large tool output bounded. Retrieve the relevant section rather than raising
  global limits reflexively.
- Persist durable state in repository plans, reports, ADRs, runbooks, and handoffs
  rather than depending on a long conversation.
- Start a fresh root context after a coherent major stage when the repository
  contains a sufficient continuation point.

## Permissions and authority

Runtime permissions describe capability, not user authorization.

Proceed autonomously through:

- read-only inspection;
- ordinary reversible local edits inside scope;
- targeted tests and validation;
- bounded service verification already approved by the active phase.

Require clear existing authority or a focused gate before:

- pushes, merges, deployments, or external publication;
- deletion or destructive cleanup;
- spending;
- secret disclosure or credential rotation;
- identity, permission, access, sudo, or security-policy changes;
- network changes;
- live impact outside the approved phase;
- third-party communication.

Consolidate related material actions into one exact gate after the read-only
baseline when possible.

## Verification and acceptance

The coordinator independently checks:

- actual checkout, branch, commit, diff, and worktree state;
- commands and tests that ran;
- acceptance criteria;
- external effects;
- unrelated-state preservation;
- secret and generated-file hygiene;
- rollback.

Worker summaries, child reports, and goal completion are evidence, not proof.
