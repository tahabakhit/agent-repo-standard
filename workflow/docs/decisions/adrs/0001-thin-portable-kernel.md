# ADR 0001: Thin portable workflow kernel

Status: accepted
Date: 2026-07-22

## Decision

Asturlab owns a versioned repository contract, deterministic state controller,
check receipts, and fail-closed verification. Codex, Claude Code, Pi, Hermes,
and optional external tools own scheduling, process topology, model selection,
context, and approval UX.

Host adapters may describe discovery and invocation only. Canonical policy stays
in the schema and controller. The kernel uses the Python standard library and
does not provide memory, dashboards, model routing, universal agent execution,
or live deployment.

## Consequences

Acceptance can be reproduced without trusting an agent's completion narrative.
Hosts retain their native strengths and failure modes. Behavioral parity is a
tested property per host, not inferred from compatible packaging. The initial
release is a Codex pilot unless another already-configured host passes the full
five-task pack.

Rollback removes the adapters and kernel commits while retaining readable task
contracts; the same acceptance commands can then be run manually.
