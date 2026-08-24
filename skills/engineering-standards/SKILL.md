---
name: engineering-standards
description: Engineering standards for design and implementation methodology -- loaded by planner, implementer, and code-reviewer agents for design-first workflow, implementation standards, and quality checklist
user-invocable: false
---

# Clean Code Methodology

The design and implementation bar for the planner, implementer, and
code-reviewer.

## Core Philosophy

Six lenses, applied as severity guidance when a decision is contested:

- **Hickey** — simple, immutable data and pure functions.
- **Carmack** — implement directly; keep a way to measure performance.
- **Armstrong** — isolate failures so one module's fault does not propagate.
- **Knuth** — clarity before cleverness.
- **Liskov** — honor interface contracts (`skills/solid-principles/SKILL.md`
  carries LSP and SRP in full).
- **Ousterhout** — deep modules, simple interfaces; pull complexity downward.

**Cost-benefit, not religion.** Every test, abstraction, and interface has an
ongoing cost: maintenance, runtime, false-positive triage, cognitive load. A
test that catches no real bug and slows the build is a liability. Premature
DRY couples behaviors that need to evolve independently. The Rule of Three is
stated in full in `skills/principle-rule-of-three/SKILL.md`.

## Code Comments

These rules govern comments inside source files, not review findings, which
use `skills/conventional-comments/SKILL.md`.

The rules are stated in full in `skills/principle-comment-the-why/SKILL.md`.

- **No TODO or FIXME comments in delivered code.** Deferred work goes in the
  implementer's report, where it is visible and actionable — not buried in the
  source where it silently ages. Even a TODO that meets every actionability
  bar does not ship.

## Design-First Workflow

1. **Understand Requirements.** Clarify requirements, edge cases, and
   constraints first. Edge case enumeration is mandatory, not aspirational:
   walk boundary values (empty, zero, max), invalid inputs, failure paths
   (timeouts, partial writes), concurrency, authorization edges, and resource
   limits before implementation.
2. **Design First.** Sketch interfaces, data structures, and module boundaries
   before implementation. Decide where the seams are.
3. **Implement Incrementally.** Small verifiable steps, each leaving the
   codebase working. Commit at each checkpoint.
4. **Self-Review.** Run the Quality Checklist below as a literal checklist on
   every file you touch.
5. **Explain Decisions.** State key design decisions and trade-offs. Document
   non-obvious choices.

## Quality Checklist

Every item is a gate. If one fails, fix it before moving on.

1. **Single Responsibility** — each function and module does one thing.
2. **Clear Naming** — names reveal intent without requiring comments.
3. **No Magic Numbers** — constants are named.
4. **Explicit Error Handling** — no silent failures.
5. **Low Coupling** — minimal dependencies between modules.
6. **Testability** — testable without complex setup; pure logic separated from
   I/O, with seams for test doubles.
7. **Readability** — a new developer understands it in 5 minutes.
8. **DRY** — no unnecessary duplication (Rule of Three applied).
9. **Performance Awareness** — no unnecessary computation, no premature
   optimization.
10. **Functional Core, Imperative Shell** — pure functions hold business
    logic; a thin shell handles I/O.
11. **No Primitive Obsession** — domain concepts (Money, Duration,
    EmailAddress, OrderId) carry a type, not a raw `string`/`int`. Long
    parameter lists with related primitives signal a missing value object.
12. **Failures are actionable** — errors and test failures name the failing
    condition with enough context to start debugging without rerunning. Avoid
    `assert(predicate)` when `assert_eq(actual, expected)` would print values.
13. **Comment Discipline** — why-only, timeless, process-free, no
    ticket/plan references, no TODO/FIXME, no commented-out code.

Items 4 and 12 rest on `skills/principle-fail-loudly/SKILL.md` and
`skills/principle-make-findings-actionable/SKILL.md`.

## When Implementing

The Design-First Workflow and Quality Checklist above are the procedure. These
are the calls they do not make for you:

- **Construct with collaborators, call with work.** Stated in full in
  `skills/principle-construct-with-collaborators/SKILL.md`.
- **No mixed levels of abstraction in a function.** Stated in full in
  `skills/principle-one-level-of-abstraction/SKILL.md`.
- **Targeted exception scopes only.** Stated in full in
  `skills/principle-targeted-exception-scopes/SKILL.md`.
- **Follow the project's existing style, naming conventions, and patterns.**
  Read neighboring files to calibrate if unsure.

## When Reviewing

- **Walk every Quality Checklist item for every changed file**, and cite the
  item by name in each finding (`issue: Clear Naming — the variable `d` does
  not reveal intent`). A finding with no checklist item is not actionable.
- **Check for Design-First evidence.** Code organized around clear interfaces
  and boundaries, or stream-of-consciousness? Lack of structure suggests the
  Design-First step was skipped.
- **Severity follows the Core Philosophy lenses.** Violations of failure
  isolation (Armstrong) or interface contracts (Liskov) outrank formatting
  (Knuth).
