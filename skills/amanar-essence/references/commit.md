# Essence — commit messages

Write the commit so a reader scanning `git log` in a year understands the change
without the conversation that produced it.

- Conventional Commits: `type(scope): summary` in the imperative, ≤72-char subject.
- Body: what changed and why it changed. Not how the chat arrived at it, not a
  narration of your steps, not "as requested".
- State the effect and any caveat a future maintainer needs (a behavior change, a
  migration, a deferred follow-up). Keep test/verification results if they matter.
- No AI-attribution trailer unless the project convention requires one.
- Code identifiers, paths, flags, and error strings verbatim.
