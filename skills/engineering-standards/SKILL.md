---
name: engineering-standards
description: Engineering standards for design and implementation methodology -- loaded by planner, implementer, and code-reviewer agents for design-first workflow, implementation standards, and quality checklist
---

# Clean Code Methodology

A design and implementation methodology that combines the wisdom of legendary
programmers with concrete standards for writing code that is readable,
maintainable, and built to last.

## Core Philosophy

Six foundational perspectives guide every design and implementation decision:

- **Rich Hickey**: Favor simple, immutable data structures and pure functions
  without side effects. Complexity is the root of most software problems.
- **John Carmack**: Implement features directly, avoiding unnecessary
  abstraction. Maintain clear strategies to measure and reason about
  performance.
- **Joe Armstrong**: Isolate failures through rigorous error handling. Ensure
  faults in one module do not propagate to others.
- **Donald Knuth**: Prioritize readable, maintainable code above all else.
  Choose clarity before cleverness.
- **Barbara Liskov**: Respect interface contracts and ensure substitutability.
  See `skills/solid-principles/SKILL.md` for full LSP treatment and depth.
- **John Ousterhout**: Fight complexity by designing deep modules with simple
  interfaces. Pull complexity downward into implementations rather than
  exposing it to callers.

## Implementation Standards

### DRY (Don't Repeat Yourself)

- Extract repeated logic into well-named functions or modules.
- Apply the **Rule of Three**: tolerate duplication the second time, extract
  the third time.
- Use configuration and parameterization over duplication.
- Balance DRY with readability -- sometimes a small amount of duplication is
  clearer than a complex abstraction.

### Clean Code Principles

- **Naming**: Use intention-revealing names that explain what and why, not how.
- **Functions**: Keep them small, focused on a single responsibility, typically
  under 20 lines.
- **Comments**: Write self-documenting code; use comments only for "why" not
  "what".
- **Formatting**: Consistent indentation, logical grouping, vertical density
  that aids comprehension.
- **Error Handling**: Fail fast, fail loud -- never silently swallow errors.

### Reusability

- Design with clear interfaces and minimal dependencies.
- Favor composition over inheritance.
- Create modules that can be used independently of the larger system.
- Parameterize behavior rather than hardcoding specifics.

### Maintainability

- Write code that your future self (or a colleague) can understand at 3 AM
  during an incident.
- Keep cognitive load low -- simple control flow, obvious data transformations.
- Apply single responsibility at every level. See
  `skills/solid-principles/SKILL.md` for full SRP depth.
- Structure code so changes are localized, not scattered across files.

### Testability

- Design for dependency injection from the start.
- Separate pure logic from side effects (I/O, database, network).
- Create seams in the code where test doubles can be inserted.
- Ensure each function can be tested in isolation with clear input/output
  contracts.

## Design-First Workflow

Follow these five steps for every non-trivial implementation:

1. **Understand Requirements**: Before writing code, clarify the exact
   requirements, edge cases, and constraints. Ask questions if anything is
   ambiguous.

2. **Design First**: Sketch the interfaces, data structures, and module
   boundaries before implementation. Think about how components will
   communicate and where the seams are.

3. **Implement Incrementally**: Build in small, verifiable steps. Each step
   should leave the codebase in a working state. Commit at each checkpoint.

4. **Self-Review**: Before presenting code, run the quality checklist below.
   Look for unnecessary complexity, potential bugs, naming that could be
   clearer, and duplication that should be extracted.

5. **Explain Decisions**: When presenting code, explain key design decisions
   and trade-offs made. Document non-obvious choices so future readers
   understand the reasoning.

## Quality Checklist

Before considering any implementation complete, verify each item:

1. **Single Responsibility** -- Each function and module does one thing well.
2. **Clear Naming** -- Names reveal intent without requiring comments.
3. **No Magic Numbers** -- All constants are named and explained.
4. **Explicit Error Handling** -- Error cases are handled; no silent failures.
5. **Low Coupling** -- Minimal dependencies between modules.
6. **Testability** -- Code can be tested without complex setup.
7. **Readability** -- A new developer could understand this in 5 minutes.
8. **DRY** -- No unnecessary duplication (Rule of Three applied).
9. **Performance Awareness** -- No unnecessary computation or memory
   allocation, but no premature optimization either.

## When Implementing

Apply this methodology during code writing with these checkpoints:

1. **Start with the Design-First Workflow.** Do not jump into code. Sketch
   interfaces and boundaries first, then implement incrementally.
2. **Run the Quality Checklist before marking a step complete.** Each of the
   9 items is a gate -- if any item fails, fix it before moving on.
3. **Apply the Core Philosophy as a lens.** When making a design decision,
   ask: does this favor simplicity (Hickey)? Is it direct (Carmack)? Are
   failures isolated (Armstrong)? Is it readable (Knuth)? Does it honor
   contracts (Liskov)? Is the interface simple (Ousterhout)?
4. **Follow Implementation Standards for the details.** Use the DRY, naming,
   function size, reusability, maintainability, and testability standards as
   concrete guidelines -- not aspirational goals.
5. **Self-review is not optional.** Run the Quality Checklist as a literal
   checklist on every file you touch.

## When Reviewing

Use this methodology as review criteria:

1. **Evaluate each Quality Checklist item as a review check.** Walk through
   all 9 items for every changed file. Flag violations by checklist item name
   (e.g., "issue: Clear Naming -- this variable name `d` does not reveal
   intent").
2. **Check for Design-First evidence.** Is the code organized around clear
   interfaces and boundaries, or does it look like it was written stream-of-
   consciousness? Lack of structure suggests the Design-First step was skipped.
3. **Apply the Core Philosophy as severity guidance.** Violations of failure
   isolation (Armstrong) or interface contracts (Liskov) are higher severity
   than formatting issues (Knuth).
4. **Cross-reference with Implementation Standards.** Check function size
   (~20 line guideline), DRY compliance (Rule of Three), composition over
   inheritance, and testability seams.
5. **Cite the specific checklist item in every finding.** This makes findings
   actionable and traceable to a concrete standard.
