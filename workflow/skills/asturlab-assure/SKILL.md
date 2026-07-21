---
name: asturlab-assure
description: Adversarially review requirements, design, implementation, or completion evidence for blockers, material risks, and advisory improvements. Use only when explicitly invoked.
---

# Asturlab Assure

Review repository and system evidence independently of the author's claims. Seek
contradictions, omitted actors and states, hidden dependencies, unsafe defaults,
partial failures, authority violations, migration and rollback gaps, unverifiable
criteria, unnecessary complexity, and outcomes that miss the original problem.

Classify findings as blocker, material, or advisory. A blocker prevents execution
or completion. A material finding must be resolved or accepted by the proper
authority. An advisory does not gate the outcome. State when review independence
is weaker because only self-review was available.

For code, use [test design](references/tests.md) and
[mocking](references/mocking.md) only where they improve observable evidence;
TDD is not mandatory.
