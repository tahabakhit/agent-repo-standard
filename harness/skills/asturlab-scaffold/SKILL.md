---
name: asturlab-scaffold
description: Design, audit, or apply the smallest useful repository harness for a new or existing project. Use only when the user explicitly invokes $asturlab-scaffold. Adapt to the repository's purpose, language, operations, and existing conventions instead of imposing a fixed tree.
---

# Scaffold

Create an agent-friendly repository harness that fits the project rather than a
universal template.

Read:

- [harness principles](references/harness-principles.md);
- [repository profiles](references/repository-profiles.md).

## Invocation

```text
$asturlab-scaffold new <destination and requirements>
$asturlab-scaffold adopt <existing repository>
$asturlab-scaffold audit <existing repository>
```

- `new`: create the minimum useful structure for a new repository.
- `adopt`: add or repair the harness of an existing repository while preserving
  its working conventions.
- `audit`: report gaps and a proposed structure without modifying files.

Invocation authorizes read-only inspection and ordinary reversible local repository
edits for `new` or `adopt`. It does not authorize deletion, destructive conversion,
package/framework installation, remote creation, pushes, publication, access
changes, or external effects unless explicitly included.

## 1. Inspect before designing

For an existing repository, inspect:

- nearest `AGENTS.md` files and instruction hierarchy;
- README and existing documentation;
- language, framework, package manager, task runner, and test commands;
- source, configuration, generated, local-only, and secret-bearing boundaries;
- CI and release behavior;
- architecture and ownership;
- current dirty state;
- plans, issues, ADRs, runbooks, and operational surfaces;
- repeated workflows that may justify project-local skills.

Preserve coherent existing conventions. Do not reorganize a working repository just
to match a preferred taxonomy.

For a new repository, inspect the destination and parent project rules before
creating anything.

## 2. Resolve only material unknowns

Accept a Requirements Brief from `$grill` when available.

When no brief exists, establish:

- outcome and primary artifact;
- repository profile or combination of profiles;
- users and collaborators;
- language/runtime/toolchain, if already chosen;
- authoritative inputs and outputs;
- operated versus non-operated status;
- validation and release expectations;
- documentation, decision, and execution-plan needs;
- public/private and secret boundaries.

Look up facts from the environment. Ask one question at a time only when an answer
changes the repository shape, toolchain, authority, or verification strategy. Give
a recommendation with each question.

If the project itself is broadly undefined rather than merely missing repository
details, stop and recommend `$grill` before scaffolding.

## 3. Propose the minimum harness

Before writing, show a compact proposed map containing:

- each file or directory to add or change;
- why it is needed now;
- its authority;
- how it will be verified;
- what common structure is deliberately omitted.

Do not create empty directories, placeholder bureaucracy, duplicated documentation,
or speculative extension points.

A typical minimum is only:

```text
README.md
AGENTS.md
<actual source/config/content>
<actual validation entrypoint>
```

Add more only when the project requires it.

## 4. Apply adaptive principles

Always:

- keep `AGENTS.md` lean and navigational;
- use `README.md` as the human entry point;
- name the actual source of truth;
- record exact setup and verification commands;
- separate tracked source from generated, local-only, and secret-bearing state;
- preserve unrelated dirty work;
- avoid duplicate authority;
- use the repository's real language and task runner;
- link to existing authoritative documentation instead of restating it.

Conditionally add:

- architecture maps for multi-domain systems;
- execution plans for long, resumable work;
- ADRs for durable choices with meaningful alternatives;
- runbooks for operated systems;
- tutorials/how-to/reference/explanation only when documentation volume benefits
  from those distinctions;
- project-local skills for repeated repository-specific procedures;
- CI only when there is a real remote workflow;
- `src/`, tests, packaging, data, generated, or deliverable directories only when
  they correspond to real artifacts.

Never make TDD, Diátaxis, MADR, Makefiles, Python packaging, or any fixed directory
tree universal.

## 5. Implement safely

For `new` or `adopt`:

1. capture repository/worktree state;
2. make the smallest coherent file set;
3. write verified project-specific content, not generic filler;
4. add validation only when it can actually run;
5. run the narrowest relevant checks;
6. inspect the complete diff;
7. report anything intentionally deferred.

Do not commit, push, create a remote, or install frameworks unless authorized.

## 6. Deliver the scaffold handoff

Report:

- selected repository profile(s);
- resulting authority map;
- files added or changed;
- existing conventions preserved;
- validation that ran;
- omitted structures and why;
- unresolved product decisions;
- recommended next action.

Recommend `$orchestrate` only when a multi-phase implementation remains. For a
bounded next task, provide the direct task instead.
