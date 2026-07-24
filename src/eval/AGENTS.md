# Amanar Eval instructions

The product spec is archived in the coordination repo under
`docs/reference/amanar/eval/reference/product-spec.md`; read it before changing
behavior.

- Keep the implementation dependency-free unless a measured need justifies otherwise.
- Use Node.js standard library, semantic HTML, and deterministic JSON.
- Treat target paths, repository content, model output, and evaluator output as untrusted.
- Never pass target-derived text through a shell; use argument arrays and validate paths.
- Never record secret values or inherited environment dumps.
- Every axis must cite evidence and carry its own evidence state. Never label a run `measured` unless all axes are measured and a paired outcome is verified.
- Write a failing test before changing scoring, validation, rendering, or orchestration behavior.
- Raw evaluator artifacts stay git-ignored; reviewed compact run records may be tracked.
