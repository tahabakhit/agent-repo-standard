---
name: amanar-guide
description: Route a request to the right amanar skill and sequence a piece of work end to end — use when unsure which skill applies, or to orient at the start of a non-trivial task.
---

# Amanar Guide

Index and router for the kit. Routing is deterministic — match the request to
the skill whose purpose fits, do not improvise a workflow.

## Catalog

- `$amanar-interview` — clarify an unclear idea into an accepted success contract.
- `$amanar-plan` — design a system from evidence, alternatives, and failure analysis.
- `$amanar-deliver` (explicit) — route a material objective through the controller to verified.
- `$amanar-adversarial-review` — independently challenge readiness and completion evidence.
- `$amanar-onboard` (explicit) — design, audit, or apply a repository harness.
- `$amanar-remember` — capture reusable knowledge into the configured store.
- `$amanar-author-skill` — author or revise a SKILL.md to kit standards.
- `$amanar-essence` — strip reader-facing writing to only what you mean.
- `$amanar-worktrees` — set up an isolated workspace before implementation.
- `$amanar-debug` — find a bug's root cause before attempting a fix.
- `$amanar-discover` — find and vet community skills to borrow.
- `$amanar-last30days` — research what people are actually saying about a topic recently.

## Sequencing a non-trivial task

1. Unclear objective, scope, or authority → `$amanar-interview` first. Never
   implement before the contract is accepted.
2. Accepted objective, non-trivial build → `$amanar-plan` for the design and
   tracer-bullet slices.
3. Isolation needed before edits → `$amanar-worktrees`.
4. Execution of a material objective → `$amanar-deliver` (the controller holds
   "done"; completion is proven by receipts).
5. A defect blocks progress → `$amanar-debug` (root cause before any fix).
6. Independent check of readiness → `$amanar-adversarial-review`.

Bounded, well-specified work needs none of these — do it directly. The routing
table is deterministic keyword matching, not a mandatory funnel.
