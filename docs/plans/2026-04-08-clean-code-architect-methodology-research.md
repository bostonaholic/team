# Research: Clean-Code-Architect Methodology Integration

## Source Content

The existing clean-code-architect agent definition at `~/.claude/agents/clean-code-architect.md` contains:

### Core Philosophy (6 programmers)
- Rich Hickey: simple, immutable data structures; pure functions
- John Carmack: implement directly, avoid unnecessary abstraction; measure performance
- Joe Armstrong: isolate failures; faults in one module don't propagate
- Donald Knuth: code readable/maintainable above all; clarity before cleverness
- Barbara Liskov: respect interface contracts; substitutability
- John Ousterhout: deep modules with simple interfaces; pull complexity downward

### Implementation Standards
- **DRY**: Rule of Three, extract shared logic, centralize constants
- **Clean Code Principles**: meaningful names, small focused functions (~20 lines), minimal comments, consistent formatting
- **Reusability**: composition over inheritance, generic interfaces, decoupled modules
- **Maintainability**: single responsibility, explicit dependencies, consistent error handling, self-documenting code
- **Testability**: dependency injection, pure functions, small testable units, clear input/output contracts

### Implementation Workflow
1. Understand requirements before coding
2. Design first (outline approach before implementation)
3. Implement incrementally (small verifiable steps)
4. Self-review (run quality checklist)
5. Explain decisions (document trade-offs)

### Quality Checklist (9 items)
1. Single Responsibility — each function/class does one thing
2. Clear Naming — names reveal intent
3. No Magic Numbers — named constants
4. Explicit Error Handling — no silent failures
5. Low Coupling — minimal dependencies between modules
6. Testability — can be tested in isolation
7. Readability — code reads like well-written prose
8. DRY — no unnecessary duplication
9. Performance Awareness — no unnecessary computation or memory allocation

## Existing Methodology Skills

### solid-principles/SKILL.md (157 lines)
- Full SOLID treatment: SRP, OCP, LSP, ISP, DIP
- Each principle has: definition, smells, remedies
- Role-specific sections: "When Implementing" and "When Reviewing"
- Currently loaded by: implementer, code-reviewer

### refactoring-to-patterns/SKILL.md (186 lines)
- Fowler's code smells: Long Method, Duplicate Code, Large Class, Feature Envy, etc.
- Safe refactoring procedure: characterization test → extract → verify
- Currently loaded by: implementer only

### adversarial-review/SKILL.md (120 lines)
- Generator-evaluator separation, Conventional Comments format
- HARD/ADVISORY gate types and verdict criteria
- Currently loaded by: code-reviewer, security-reviewer, technical-writer, ux-reviewer

## Agent Methodology Load Counts

| Agent | Current Skills | Count | Room? |
|-------|---------------|-------|-------|
| implementer | solid-principles, refactoring-to-patterns | 2 | +1 (hits limit of 3) |
| code-reviewer | solid-principles, adversarial-review | 2 | +1 (hits limit of 3) |
| planner | technical-design-doc (conditional) | 0-1 | +1-2 headroom |
| plan-critic | (none) | 0 | +3 headroom |
| test-architect | test-first-development | 1 | +2 headroom |

## Overlap Analysis

### Overlapping with solid-principles
- **Liskov/LSP**: clean-code-architect has "Barbara Liskov: respect interface contracts" — solid-principles has full LSP section with smells and remedies
- **SRP**: clean-code-architect has "single responsibility" in quality checklist — solid-principles has full SRP section

### Unique to clean-code-architect
- DRY (Rule of Three) — not covered by solid-principles
- Naming standards — not covered
- Function size norms (~20 lines) — not covered
- Comment philosophy — not covered
- Design-first workflow — not covered
- Quality checklist format — not covered
- Testability/DI — not covered
- Performance awareness — not covered
- Reusability/composition — not covered (OCP is related but different focus)

### Unique to solid-principles
- OCP (Open/Closed Principle) — full treatment
- ISP (Interface Segregation) — full treatment
- DIP (Dependency Inversion) — full treatment
- Specific code smells per principle

**Conclusion**: Minimal overlap. The skills are complementary. engineering-standards covers breadth (DRY, naming, functions, testability, workflow); solid-principles covers SOLID depth. They should be kept separate, with engineering-standards deferring to solid-principles for LSP/SRP detail.

## Relevant Files

### Must modify
- New: `skills/engineering-standards/SKILL.md` — the methodology skill
- `agents/implementer.md` — add load statement (3rd methodology skill)
- `agents/code-reviewer.md` — add load statement (3rd methodology skill)
- `agents/planner.md` — add load statement for design-first workflow
- `docs/architecture.md` — update Section 6 methodology skills table

### Reference only
- `skills/solid-principles/SKILL.md` — pattern reference, overlap check
- `skills/refactoring-to-patterns/SKILL.md` — pattern reference
- `~/.claude/agents/clean-code-architect.md` — source content (do NOT reference at runtime)
- `skills/team/registry.json` — no changes needed (methodology skills don't affect event pipeline)
- `.claude-plugin/plugin.json` — no changes needed

## Open Questions

1. Should engineering-standards mention Liskov/SRP inline or explicitly defer to solid-principles for those?
2. Should planner load this skill? The design-first workflow is relevant but planner is primarily a planning agent.
3. Given implementer hits the 3-skill soft limit, is that acceptable or should content be merged?
4. Should plan-critic also load this for evaluating plan quality against engineering-standards principles?
5. Should the quality checklist be adapted for code-reviewer (review criteria) vs implementer (self-review)?
