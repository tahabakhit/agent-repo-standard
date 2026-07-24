---
name: amanar-plan
description: Design a project or system from evidence using adaptive cross-domain coverage, alternatives, failure analysis, migration, recovery, and verification — use when an accepted objective needs a rigorous implementation plan.
---

# Amanar Plan

Start from the accepted objective and verified current state. Compare credible
alternatives proportionately, then design only the concerns supported by evidence:
actors and authority; structure and interfaces; dependencies, state, and flows;
failure and partial success; security, privacy, and safety; migration and
compatibility; operation and recovery; and validation evidence.

Avoid a universal template. Resolve named technical uncertainty with targeted
research. Make assumptions explicit and identify blockers. Express the executable
plan as a [task spec](references/task-spec.md) — GOAL, DONE-WHEN, SCOPE, VERIFY,
BLAST-RADIUS — that compiles to a controller contract for `$amanar-deliver`. For
software module
design, use [deep modules](references/deep-modules.md),
[deepening](references/deepening.md), and
[design it twice](references/design-it-twice.md) when relevant.
