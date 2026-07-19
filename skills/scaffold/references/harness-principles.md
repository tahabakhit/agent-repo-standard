# Repository harness principles

These are invariants, not a mandatory directory tree.

## Authority

Every fact or instruction has one authoritative home.

- Agent operating rules: nearest applicable `AGENTS.md`.
- Human orientation: `README.md`.
- Runtime behavior: code/configuration and executable validation.
- Durable decisions: an existing decision system, or ADRs when justified.
- Operational truth: runbooks, inventory, and configuration chosen by the project.
- Current multi-stage execution: a plan or handoff when resumability requires one.

Link across planes. Do not copy the same authority into several documents.

## Progressive disclosure

The root should tell agents where to look, not contain everything.

A useful `AGENTS.md` normally identifies:

- repository purpose;
- authoritative maps and source locations;
- safety and scope boundaries;
- exact verification entrypoints;
- nearest scoped instructions.

Detailed architecture, domain facts, and procedures belong in deeper files that are
loaded when relevant.

## Proportional structure

Structure must pay rent.

Create a directory or document only when it:

- owns real content now;
- removes ambiguity;
- enables deterministic verification;
- preserves a durable decision;
- supports an operated system;
- enables a repeated workflow.

Do not create empty taxonomies in anticipation of hypothetical future work.

## Existing repositories

Adoption is a refactor, not a replacement.

- Preserve working commands and layout.
- Add a lean entrypoint and missing authority links first.
- Rename or move content only when duplication or ambiguity causes a real problem.
- Separate cleanup from functional change.
- Keep rollback simple.

## Validation

A harness is useful only when the agent can verify work.

Prefer one documented entrypoint such as the repository's existing task runner,
package scripts, CI command, or a small validation script. Do not add a Makefile
merely to create uniformity.

State what was actually run. Never turn a placeholder command into a quality gate.
