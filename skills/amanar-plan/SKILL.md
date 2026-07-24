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

Design against an accepted objective only — designing before requirements are
accepted is out of order; return to `$amanar-interview` first. When the solution
space is wide, compare 2–3 approaches with trade-offs and design from the chosen
one, grafting the best ideas from the others.

Structure the plan as tracer-bullet vertical slices: each slice is an
independently verifiable end-to-end increment (a real path through the system,
not a horizontal layer), with its own checks, sequenced so the earliest slice
proves the riskiest assumption. Each slice maps to a controller contract.
