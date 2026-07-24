---
name: amanar-debug
description: Find a bug's root cause before attempting any fix — reproduce, investigate evidence, compare against a working example, form and test one hypothesis at a time, then fix only the root cause under a failing test.
---

# Amanar Debug

No fixes without root-cause investigation first. Guessing is slower than it
looks; systematic investigation is faster even under pressure.

## Phase 1 — Root-cause investigation

Read the full error message and stack. Reproduce the failure consistently —
without a reliable repro you are guessing. Review recent changes and gather
diagnostic evidence across the components involved. Do not propose a fix yet.

## Phase 2 — Pattern analysis

Find a working example of the same pattern. Compare it against the failing case
completely, list every difference, and understand the dependencies. The bug
usually lives in a difference you can name.

## Phase 3 — Hypothesis and test

State one specific hypothesis for the cause. Make the smallest change that would
confirm or refute it. Test one variable at a time — never bundle changes.

## Phase 4 — Fix

Write a test that fails for the right reason (it reproduces the bug). Fix only
the identified root cause. Verify the test passes and nothing else regressed.

## Red flags — stop and reconsider

Attempting a fix before reproducing; bundling several changes; skipping the
failing test; a symptom-level patch. After three failed fix attempts, stop
patching symptoms and question whether the architecture itself is wrong.

## Attribution

Adapted from `systematic-debugging` by Jesse Vincent (obra/superpowers, MIT).
