---
name: amanar-assure
description: Adversarially review requirements, design, implementation, or completion evidence for blockers, material risks, and advisory improvements — use when independent verification of readiness or correctness is needed.
---

# Amanar Assure

Review repository and system evidence independently of the author's claims. Seek
contradictions, omitted actors and states, hidden dependencies, unsafe defaults,
partial failures, authority violations, migration and rollback gaps, unverifiable
criteria, unnecessary complexity, and outcomes that miss the original problem.

Classify findings as blocker, material, or advisory. A blocker prevents execution
or completion. A material finding must be resolved or accepted by the proper
authority. An advisory does not gate the outcome. State when review independence
is weaker because only self-review was available.

No evidence, no verdict. Every finding cites the exact command run and its output.
When checking discrete claims, classify each VERIFIED / CONTRADICTED / UNVERIFIED and
pin the citation to the file:line or command that settles it. This finding-evidence
discipline is the narrative complement to the controller's pass/fail receipts, not a
second gate.

For code, use [test design](references/tests.md) and
[mocking](references/mocking.md) only where they improve observable evidence;
TDD is not mandatory.

The VERIFIED / CONTRADICTED / UNVERIFIED evidence-citation discipline is
reimplemented from iamneilroberts/claude-skills (MIT).
