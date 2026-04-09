# Plan: Clean-Code-Architect Methodology Integration

## Context

The project's CLAUDE.md includes programming principles from six legendary
programmers (Hickey, Carmack, Armstrong, Knuth, Liskov, Ousterhout) plus
implementation standards (DRY, naming, function size, testability). These
exist only in the user's personal config and are invisible to TEAM pipeline
agents. This plan extracts that methodology into a shared skill and wires it
into the planner, implementer, and code-reviewer agents so the pipeline
produces code that consistently meets engineering standards. Based on research
at `docs/plans/2026-04-08-clean-code-architect-methodology-research.md`.

## Steps

### Phase 1: Create the engineering-standards methodology skill

**1.1** `[sequential]` Create `skills/engineering-standards/SKILL.md`

- **File:** `skills/engineering-standards/SKILL.md` (new file)
- **What to add:**
  - YAML frontmatter following solid-principles pattern: `name: engineering-standards`,
    `description:` one-liner mentioning design and implementation methodology
  - **Core Philosophy** section listing all 6 programmer philosophies (Hickey,
    Carmack, Armstrong, Knuth, Liskov, Ousterhout) with one-sentence summaries.
    For Liskov, acknowledge the principle by name but defer to
    `skills/solid-principles/SKILL.md` for full LSP treatment.
  - **Implementation Standards** section with subsections: DRY (Rule of Three),
    Clean Code Principles (naming, function size ~20 lines, comments,
    formatting, error handling), Reusability (composition over inheritance),
    Maintainability (single responsibility acknowledged, defer to
    solid-principles for SRP depth), Testability (DI, pure functions, seams)
  - **Design-First Workflow** section with the 5-step workflow:
    understand requirements, design first, implement incrementally, self-review,
    explain decisions
  - **Quality Checklist** with all 9 items as a numbered list, using these
    exact canonical names: "Single Responsibility", "Clear Naming",
    "No Magic Numbers", "Explicit Error Handling", "Low Coupling",
    "Testability", "Readability", "DRY", "Performance Awareness"
  - **When Implementing** section (role-specific, mirrors solid-principles
    pattern): actionable checkpoints for the implementer agent to apply during
    code writing -- run the quality checklist, apply design-first workflow
  - **When Reviewing** section (role-specific): how the code-reviewer uses the
    quality checklist as review criteria -- each checklist item becomes a
    review check, flag violations by checklist item name
  - All content inlined. No external path references to source material.
    Only cross-references allowed are to `skills/solid-principles/SKILL.md`
    for LSP/SRP depth.
- **Verification:** File exists, has valid YAML frontmatter, contains all 6
  philosopher names, all 9 checklist items, "When Implementing" section, and
  "When Reviewing" section. Test T1-T4.

### Phase 2: Wire skill into consuming agents

All three agent modifications are independent; they can run in parallel.

**2.1** `[parallel]` Add load statement to `agents/planner.md`

- **File:** `agents/planner.md`
- **What to change:** Add a paragraph in the Rules section, as a new Rule 7,
  instructing the planner to load `skills/engineering-standards/SKILL.md` for
  the design-first workflow when producing plans. The load statement should
  reference specifically the design-first workflow and quality checklist as
  guidance for structuring plan phases. Follow the same `Load \`skills/...\``
  phrasing pattern used by other agents.
- **Verification:** `grep -q "engineering-standards/SKILL.md" agents/planner.md` succeeds.
  Test T5.

**2.2** `[parallel]` Add load statement to `agents/implementer.md`

- **File:** `agents/implementer.md`
- **What to change:** Add a paragraph in the "Code Quality" section (after
  the existing SOLID and refactoring-to-patterns references) instructing the
  implementer to load `skills/engineering-standards/SKILL.md` for implementation
  standards and the quality checklist. Reference the "When Implementing"
  section specifically. This makes engineering-standards the 3rd methodology skill
  (hitting the soft limit of 3).
- **Verification:** `grep -q "engineering-standards/SKILL.md" agents/implementer.md`
  succeeds. Test T6. Existing solid-principles and refactoring-to-patterns
  references still present (regression tests T11, T12).

**2.3** `[parallel]` Add load statement to `agents/code-reviewer.md`

- **File:** `agents/code-reviewer.md`
- **What to change:** Add a bullet or paragraph in the "Inspect the code"
  section (step 4) or after the SOLID violations subsection, instructing the
  code-reviewer to load `skills/engineering-standards/SKILL.md` and use the "When
  Reviewing" section as additional review criteria. This makes engineering-standards the
  3rd methodology skill for code-reviewer (hitting the soft limit of 3).
- **Verification:** `grep -q "engineering-standards/SKILL.md" agents/code-reviewer.md`
  succeeds. Test T7. Existing solid-principles and adversarial-review
  references still present (regression tests T13, T14).

### Phase 3: Update documentation

**3.1** `[sequential]` Update methodology skills table in `docs/architecture.md`

- **File:** `docs/architecture.md`
- **What to change:** Add three new rows to the "Methodology (loaded by agents,
  not directly invoked)" table in Section 6:
  1. An `engineering-standards` row: `| \`engineering-standards\` | Engineering standards, implementation methodology, quality checklist | Loaded by planner, implementer, code-reviewer |`
     Insert it between the `adversarial-review` row and the `engineering-standards` row.
  2. A `solid-principles` row: `| \`solid-principles\` | SOLID design principles (SRP, OCP, LSP, ISP, DIP) | Loaded by implementer, code-reviewer |`
     Insert it in the appropriate position among the existing rows.
  3. A `refactoring-to-patterns` row: `| \`refactoring-to-patterns\` | Code smells and safe refactoring procedures | Loaded by implementer |`
     Insert it in the appropriate position among the existing rows.
  These two additional rows are confirmed absent in the current table per
  the research findings.
- **Verification:** `grep -q "engineering-standards" docs/architecture.md` succeeds and
  the engineering-standards row names all 3 consumer agents. Tests T8, T9, T17, T18.

## Tests

Test file: `tests/engineering-standards-methodology-tests.sh`

Follow the exact conventions from `tests/skill-architecture-tests.sh`: bash
script with `pass`/`fail` helpers, PASS/FAIL output format, non-zero exit on
any failure.

| # | Test Name | What It Verifies | Step |
|---|-----------|------------------|------|
| T1 | `skill file exists with valid frontmatter` | `skills/engineering-standards/SKILL.md` exists and contains `name: engineering-standards` in YAML frontmatter | 1.1 |
| T2 | `skill contains all 6 philosopher names` | File contains "Hickey", "Carmack", "Armstrong", "Knuth", "Liskov", "Ousterhout" | 1.1 |
| T3 | `skill contains all 9 quality checklist items` | File contains all 9 exact canonical checklist item strings: "Single Responsibility", "Clear Naming", "No Magic Numbers", "Explicit Error Handling", "Low Coupling", "Testability", "Readability", "DRY", "Performance Awareness" | 1.1 |
| T4 | `skill contains role-specific sections` | File contains both "When Implementing" and "When Reviewing" headings | 1.1 |
| T5 | `planner.md references engineering-standards/SKILL.md` | `agents/planner.md` contains string `engineering-standards/SKILL.md` | 2.1 |
| T6 | `implementer.md references engineering-standards/SKILL.md` | `agents/implementer.md` contains string `engineering-standards/SKILL.md` | 2.2 |
| T7 | `code-reviewer.md references engineering-standards/SKILL.md` | `agents/code-reviewer.md` contains string `engineering-standards/SKILL.md` | 2.3 |
| T8 | `architecture.md methodology table includes engineering-standards row with all 3 consumers` | Extract the engineering-standards row from `docs/architecture.md`, then verify that row contains "planner", "implementer", and "code-reviewer" | 3.1 |
| T9 | `architecture.md adversarial-review row unchanged` | The adversarial-review row still names code-reviewer, security-reviewer, ux-reviewer, technical-writer (no regression) | 3.1 |
| T10 | `skill defers to solid-principles for LSP/SRP` | `skills/engineering-standards/SKILL.md` contains a reference to `solid-principles/SKILL.md` | 1.1 |
| T11 | `implementer.md still references solid-principles/SKILL.md` | No regression on existing solid-principles load statement | 2.2 |
| T12 | `implementer.md still references refactoring-to-patterns/SKILL.md` | No regression on existing refactoring-to-patterns load statement | 2.2 |
| T13 | `code-reviewer.md still references solid-principles/SKILL.md` | No regression on existing solid-principles load statement | 2.3 |
| T14 | `code-reviewer.md still references adversarial-review/SKILL.md` | No regression on existing adversarial-review load statement | 2.3 |
| T15 | `skill contains design-first workflow with all 5 steps` | File contains "Design First" or "Design-First" heading/label, and all 5 workflow step keywords: (1) "understand" or "requirements", (2) "Design First" or "Design-First", (3) "incrementally" or "incremental", (4) "self-review" or "quality checklist", (5) "explain decisions" or "trade-offs" | 1.1 |
| T16 | `registry.json and plugin.json unchanged` | `git diff` shows no changes to `skills/team/registry.json` or `.claude-plugin/plugin.json` | all |
| T17 | `architecture.md methodology table includes solid-principles row` | `docs/architecture.md` contains a `solid-principles` row in the methodology table | 3.1 |
| T18 | `architecture.md methodology table includes refactoring-to-patterns row` | `docs/architecture.md` contains a `refactoring-to-patterns` row in the methodology table | 3.1 |

## Done Criteria

- [ ] All 18 acceptance tests pass (`bash tests/engineering-standards-methodology-tests.sh`)
- [ ] Existing test suite still passes (`bash tests/skill-architecture-tests.sh`)
- [ ] `skills/engineering-standards/SKILL.md` exists with all required content inlined
- [ ] No modifications to `skills/team/registry.json` or `.claude-plugin/plugin.json`
- [ ] Three agents (planner, implementer, code-reviewer) reference the new skill
- [ ] `docs/architecture.md` methodology table has engineering-standards, solid-principles, and refactoring-to-patterns rows
- [ ] `git diff --stat` shows exactly 5 files changed: 1 new skill, 3 agent files, 1 docs file
