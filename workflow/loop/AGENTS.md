# Loop component

`run_loop.py` is the bounded-loop runner for a single kernel workflow. It owns
control flow in deterministic code: each iteration invokes a host with a fresh
context to mutate the target repository, then the runner drives the controller
(`begin`, `run-check`, `verify`) and grades world-state from `status --json` — never
the agent's transcript.

Boundaries:

- The runner, not the agent, issues the controller commands, so it recovers a
  spurious `block` (resumes) and never depends on the agent remembering `verify`.
- Bounded by `--max-iterations`; loops only mechanical, verifiable work.
- `pass^k`: after the controller reports verified, each declared check command must
  pass on `k` direct re-runs.
- Authority is fail-closed: a denied `begin` or a live-effect check without authority
  stops the loop; it never escalates.
- Host invocation shapes come from `workflow/hosts.py` (shared with the pack). The
  runner adds no host authority.

Run `python3 -m unittest discover -s tests` after changes. The tests inject a fake
agent, so they need no model or network.
