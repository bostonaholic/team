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
DRY couples behaviors that need to evolve independently. Apply the **Rule of
Three**: tolerate duplication the second time, extract on the third.

## Code Comments

These rules govern comments inside source files, not review findings, which
use `skills/conventional-comments/SKILL.md`.

Comments never explain WHAT the code does. Intention-revealing names and
structure carry that. A comment is permitted only for a non-obvious WHY, such
as a constraint, a workaround, or a surprising requirement, and only when
neither intention-revealing code nor tests can carry the explanation.

- **Rewrite first.** A comment that feels necessary is a signal to rewrite the
  code until the comment is unnecessary. Extract a well-named function or
  variable before reaching for a comment.
- **No ticket/issue IDs, plan/slice/phase markers, or doc-section references
  in comments.** They rot: the tracker migrates, the plan is deleted, the
  section is renumbered, and the comment becomes a lie.
  Exemption: an upstream-bug link where the link IS the why — a workaround
  pointing at a public issue URL stays true for exactly as long as the
  workaround does. The ban targets internal trackers and pipeline artifacts,
  not those links.
- **No process narration.** Describe the code as it exists now. No dates,
  corrections, changelog entries, or historical narration. Never describe the
  edit that produced the code. Never mention the user, the prompt, review
  feedback, ticket discussion, or agent instructions. Marker phrases such as
  "Previously", "Originally", "As of", "Correction", "Temporary fix from", and
  "This was changed because" are detection hints, not the rule itself.
- **Document non-obvious constraints and deliberate oddities.** This is the
  permitted comment class: API limits, compatibility, security assumptions,
  performance, ordering, concurrency, and framework surprises. For a
  deliberate oddity, state the consequence of removing or simplifying the code.
- **Local, concise, precise, verified.** Place a comment next to the code it
  explains. Name the exact condition, risk, or dependency — never "handle edge
  case". Document only verified behavior. Refer to symbols and stable
  identifiers, never to line numbers or file layout.
- **No duplicated documentation.** Do not repeat what types, tests, names, and
  public docs already carry. Link an external spec only when the code
  implements a precise external contract.
- **No commented-out code.** Version control remembers deleted code.
- **No TODO or FIXME comments in delivered code.** Deferred work goes in the
  implementer's report, where it is visible and actionable — not buried in the
  source where it silently ages. Even a TODO that meets every actionability
  bar does not ship.
- **Maintain: remove obsolete comments, preserve repo style.** A change that
  invalidates a comment updates or deletes it in the same diff.
- **Doc comments on exported/public interfaces are exempt.** They follow the
  ecosystem's convention (JSDoc, docstrings, rustdoc) and define the
  abstraction. The why-only rule governs implementation comments. A doc
  comment that merely repeats the signature is a what-comment, not an exempt
  doc comment.

**Decision Test.** Before you keep a comment: does it explain why? Would code
or tests carry it better? Is it true after this change, with no reference to
the process? Will it still be true when the surrounding code changes?

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

## When Implementing

The Design-First Workflow and Quality Checklist above are the procedure. These
are the calls they do not make for you:

- **Construct with collaborators, call with work.** Constructors take
  long-lived dependencies (clock, DB, logger, HTTP client) that define
  identity. Methods take per-call work parameters (date range, request body).
  Constructors do no work — no I/O, no static lookups, no expensive
  computation.
- **No mixed levels of abstraction in a function.** A function calls functions
  one level below its own. If one function does both high-level orchestration
  and low-level byte work, extract the low-level work into a helper named at
  the surrounding level.
- **Targeted exception scopes only.** Wrap exactly the call that can throw.
  Catch the specific exception subclass. Rethrow with the original cause
  chained. Never `catch (Exception e)` around a large block.
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
