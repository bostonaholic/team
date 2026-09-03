---
name: engineering-standards
description: Apply Team's design, implementation, comment, and review standards. Loaded by planner, implementer, and code-reviewer.
user-invocable: false
---

# Clean Code Methodology

## Input

Apply to every planned, implemented, or reviewed changed file.

## Core Philosophy

- **Hickey:** simple immutable data and pure functions.
- **Carmack:** direct code with measurable performance.
- **Armstrong:** isolated failures.
- **Knuth:** clarity before cleverness.
- **Liskov:** interface contracts; `skills/solid/SKILL.md` owns LSP/SRP.
- **Ousterhout:** deep modules with simple interfaces.

Use cost-benefit judgment. Apply the Rule of Three: extract on the third
occurrence, not the second.

## Code Comments

These rules cover source comments; review findings use
`skills/conventional-comments/SKILL.md`.

- Comments explain a **non-obvious WHY**, never WHAT. Rewrite names or
  structure first.
- No ticket/issue IDs, plan/slice/phase markers, or doc-section references.
  A public upstream issue link is allowed when that link is the why.
- No process history, dates, prompts, review narration, or stale corrections.
- State the exact verified constraint and the consequence of removing an
  intentional oddity. Keep it local and timeless.
- Do not duplicate names, types, tests, or public docs.
- No commented-out code and no TODO/FIXME in delivered code.
- Update or delete comments invalidated by the change.
- Doc comments on exported/public interfaces may add contract information not
  present in the signature; repeating the signature is still a WHAT comment.

## Design-First Workflow

1. **Understand Requirements:** enumerate boundary/invalid inputs, failure
   paths, concurrency, authorization, and resource limits.
2. **Design First:** choose interfaces, data, and module boundaries.
3. **Implement Incrementally:** keep each checkpoint working.
4. **Self-Review:** apply every checklist item below to every changed file.
5. **Explain Decisions:** record consequential trade-offs and constraints.

## Quality Checklist

1. **Single Responsibility** — one purpose per function or module.
2. **Clear Naming** — names state intent without comments.
3. **No Magic Numbers** — name meaningful constants.
4. **Explicit Error Handling** — no silent failures.
5. **Low Coupling** — minimize dependencies between modules.
6. **Testability** — separate pure logic from I/O and expose simple seams.
7. **Readability** — a new contributor can follow the code quickly.
8. **DRY** — apply the Rule of Three.
9. **Performance Awareness** — avoid waste and premature optimization.
10. **Functional Core, Imperative Shell** — pure business logic; thin I/O shell.
11. **No Primitive Obsession** — represent domain concepts with domain types.
12. **Failures are actionable** — include the failed condition and useful values.
13. **Comment Discipline** — follow the rules above.

## When Implementing

- **Construct with collaborators:** keep them long-lived; call methods with per-request work.
  Constructors do no I/O, lookup, or expensive computation.
- Keep one abstraction level per function.
- Catch the specific exception around exactly the throwing call and preserve
  its cause. Do not wrap a large block.
- Match neighboring style and established patterns.

## When Reviewing

Walk every Quality Checklist item for every changed file. Each finding names
the item and consequence. Use Core Philosophy for severity; failure isolation
and interface-contract defects outrank formatting.

## Done

During authoring or implementation, every checklist item passes before moving
on. During review, every failure becomes a cited finding.
