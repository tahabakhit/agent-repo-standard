# Scaffold behavioural evaluation cases

`scaffold-evaluations.json` is a small review corpus for explicit `$asturlab-scaffold`
agent runs. Each case records the repository signals, expected recommendation,
structures that must survive, prohibited recommendations, and human review
criteria.

`harness/tests/validate-harness.py` validates only the JSON schema and required scenario
coverage. It does not run a model, derive scaffold decisions from policy, or judge
recommendation quality. Until an evaluator is deliberately implemented, use the
cases as behavioural prompts and review the resulting agent recommendations
against their criteria.
