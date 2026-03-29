# Skill Architecture Research: Thin Entry Points vs Self-Contained Skills

**Date:** 2026-03-28
**Topic:** skill-architecture-research
**Researcher:** researcher agent

---

## Current State Analysis

### Inventory: 24 skills across two clear categories

**Entry point skills (10)** — registered as slash commands:

| Skill | Lines | Current Pattern |
|-------|-------|-----------------|
| `team` | 117 | Thin router; references `worktree-isolation/SKILL.md` inline |
| `team-fix` | 81 | Thin router; references `test-driven-bug-fix/SKILL.md` inline |
| `team-ship` | 57 | Orchestrator; references `changelog/SKILL.md` + `git-commit/SKILL.md` |
| `team-brainstorm` | 169 | Fully self-contained; all session logic inline |
| `team-research` | 29 | Thin; delegates to team event loop |
| `team-plan` | 26 | Thin; delegates to team event loop |
| `team-test` | 20 | Thin; delegates to team event loop |
| `team-implement` | 22 | Thin; delegates to team event loop |
| `team-verify` | 20 | Thin; delegates to team event loop |
| `team-resume` | 28 | Thin; all logic inline |

**Methodology skills (14)** — domain knowledge for agents:

| Skill | Lines | Consumers |
|-------|-------|-----------|
| `rpi-workflow` | 135 | router/orchestrator |
| `test-first-development` | 108 | test-architect, orchestrator |
| `adversarial-review` | 115 | 0 explicit (documented but not wired) |
| `systematic-debugging` | 107 | agents when debugging |
| `test-driven-bug-fix` | 122 | team-fix entry point |
| `worktree-isolation` | 79 | team entry point |
| `changelog` | 176 | team-ship entry point |
| `git-commit` | 158 | team-ship entry point |
| `product-requirements-doc` | 133 | product-owner agent |
| `technical-design-doc` | 165 | planner agent |
| `documenting-decisions` | 136 | planner/orchestrator |
| `solid-principles` | 157 | implementer, code-reviewer (2 consumers) |
| `refactoring-to-patterns` | 186 | implementer |
| `writing-prose` | 154 | technical-writer |

### Three loading mechanisms in active use

**Mechanism A — Entry point references methodology in prose**: The entry point skill's text says "read `skills/X/SKILL.md`". The agent reads it on demand at runtime.
- Examples: `team` → `worktree-isolation`, `team-fix` → `test-driven-bug-fix`, `team-ship` → `changelog` + `git-commit`

**Mechanism B — Agent body explicitly loads methodology skill**: Agent's markdown body says "Load `skills/X/SKILL.md` for the full methodology."
- Examples: `planner` → `technical-design-doc`, `product-owner` → `product-requirements-doc`, `implementer` → `solid-principles` + `refactoring-to-patterns`, `technical-writer` → `writing-prose`, `code-reviewer` → `solid-principles`

**Mechanism C — Methodology content duplicated inline**: A methodology skill exists but is not referenced by agents. The agent contains equivalent instructions in its own body.
- Example: `adversarial-review/SKILL.md` exists (Conventional Comments format, gate types, verdict criteria) but no reviewer agent contains an explicit load instruction for it. Each reviewer independently specifies its own comment format and verdict rules.

### Inconsistency found

`adversarial-review/SKILL.md` is documented in `docs/architecture.md` as "loaded by review agents" but no agent file contains a load instruction for it. The review format content is duplicated across 4 agent files independently.

### Context window cost

Each skill load injects the full skill content into context. Costs:
- `implementer` loads: `solid-principles` (157 lines) + `refactoring-to-patterns` (186 lines) = 343 lines additional context
- `team-ship` loads: `changelog` (176 lines) + `git-commit` (158 lines) = 334 lines additional context
- `planner` loads: `technical-design-doc` (165 lines) conditionally

Methodology skills average 143 lines. Entry point skills average 57 lines.

### Reuse map

| Methodology Skill | Loaded By |
|-------------------|-----------|
| `solid-principles` | `implementer`, `code-reviewer` (2 consumers) |
| `product-requirements-doc` | `product-owner` (1 consumer) |
| `technical-design-doc` | `planner` (1 consumer) |
| `writing-prose` | `technical-writer` (1 consumer) |
| `refactoring-to-patterns` | `implementer` (1 consumer) |
| `test-driven-bug-fix` | `team-fix` entry point (1 consumer) |
| `worktree-isolation` | `team` entry point (1 consumer) |
| `changelog` | `team-ship` entry point (1 consumer) |
| `git-commit` | `team-ship` entry point (1 consumer) |
| `adversarial-review` | 0 explicit consumers (documented but not wired) |

---

## External Patterns

### Claude Code Plugin Ecosystem

No public specification exists for Claude Code plugin skill architecture as of March 2026. The plugin system describes `SKILL.md` files with YAML frontmatter that auto-register as slash commands when placed in `skills/<name>/SKILL.md`. There is no documented pattern for "methodology skills" vs "entry point skills" — this is a design choice made by TEAM.

### LangChain / LangGraph

LangGraph uses a graph-based pipeline where nodes are individual task units. The analog to "methodology skills" would be prompts stored in a `prompts/` directory and loaded by graph nodes as needed. LangGraph does not prescribe a separation between "entry points" and "domain knowledge" — both are typically inlined in node definitions. Large-scale deployments extract shared prompts into a `PromptTemplate` registry to enable reuse, mirroring Mechanism B.

Key pattern: **conditional loading** — nodes load methodology prompts only when a code path requires them, reducing token cost for simple cases.

### CrewAI

CrewAI uses `Agent` objects with `backstory`, `goal`, and `role` strings that function as inline methodology. The framework does not enforce extraction of shared methodology. When teams share methodology across agents, they typically use Python string constants or template files loaded at agent instantiation time.

Pattern: **always-inline** is the default. Extraction to shared files is a project-level convention, not framework-enforced.

### AutoGen

AutoGen uses `ConversableAgent` with system messages. Shared methodology is extracted to `system_message` template strings shared across agents. This is equivalent to Mechanism B. AutoGen GroupChat orchestration is equivalent to TEAM's thin router pattern — the GroupChatManager has no agent-specific knowledge.

### VS Code Extensions

VS Code separates "commands" (entry points, registered in `package.json`) from "providers" (domain logic, registered via API). A command handler delegates to a provider; it does not inline the domain logic. Strong precedent for thin entry points.

However, VS Code providers are instantiated once, not reloaded on each invocation. The analog breaks because Claude Code skills are loaded fresh on each invocation.

### WordPress Plugins

WordPress hooks register callback functions. The WordPress Codex recommends thin hook callbacks that delegate to classes for testability. Large plugins (WooCommerce, Yoast) use this pattern universally.

Key insight: **testability drives extraction**. Inline logic cannot be unit tested independently of the hook mechanism.

### General Plugin/Extension Patterns

The **plugin-point pattern** (Gang of Four, POSA): An extension point provides a thin interface. Domain logic lives in interchangeable strategies (methodology skills) that the entry point selects and invokes. This enables:
- Swap one strategy without changing the entry point
- Combine strategies (multiple methodology skills for one agent)
- Reuse strategies across entry points

The **template method pattern**: A base procedure (entry point) with placeholder steps filled in by loaded methodology. `team-ship` exemplifies this: the ship procedure is fixed; changelog format and commit discipline are plugged in via skill references.

---

## Trade-off Analysis

### Thin Entry Points + External Methodology (current dominant pattern)

**Advantages:**
- Single source of truth for methodology — update once, affects all consumers
- Methodology skills are independently readable and understandable
- Enables cross-agent reuse (`solid-principles` loaded by 2 agents)
- Entry point files stay small and scannable
- Methodology can be versioned/evolved independently of pipeline wiring

**Disadvantages:**
- Requires two file reads per invocation (entry point + methodology skill)
- Context window cost: every loaded methodology skill adds to context even if only a portion is needed
- Discovery gap: a reader of the entry point must follow a reference to understand full behavior
- No compile-time guarantee that referenced skill files exist (broken reference fails silently until runtime)

### Self-Contained Skills (current pattern for `team-brainstorm`)

**Advantages:**
- Everything needed is in one file — no indirection
- Lower cognitive cost for readers who only need to understand one command
- No risk of broken references to external methodology files
- Context window contains exactly what's needed, no more

**Disadvantages:**
- If methodology logic evolves, every self-contained skill that inlined it must be updated separately
- Duplication risk: same methodology content appears in multiple files
- Harder to ensure consistency across skills that cover related territory
- Full self-containment for complex skills pushes file size significantly higher

### The Hybrid (current pattern for `team`, `team-fix`)

The entry point contains primary procedure logic inline and references external skills only for distinct, reusable sub-procedures.

**Observed advantage**: Scales naturally — simple procedures stay inline, complex reusable sub-procedures get extracted. Matches the rule-of-three principle.

**Observed disadvantage**: The extraction threshold is not consistently applied. `team-brainstorm` is self-contained (169 lines) while `worktree-isolation` is extracted despite having only one consumer. Inconsistency makes architecture harder to reason about.

### Conditional Loading (current pattern for agents)

Agents load methodology skills conditionally ("if this scenario arises, load X"). This is context-efficient: the planner only loads `technical-design-doc` for complex features.

**Advantage**: Token efficiency.
**Disadvantage**: The condition for loading is stated in natural language, not enforced mechanically.

---

## Open Questions

1. **What is the extraction threshold?** Should methodology be extracted only when it has 2+ consumers? Currently extracts at 1 consumer (`worktree-isolation` has 1 consumer: `team`). A rule of 2+ would mean `worktree-isolation`, `test-driven-bug-fix`, `changelog`, and `git-commit` would all be inlined.

2. **Should `adversarial-review/SKILL.md` be wired?** The skill exists and is documented as "loaded by review agents" but no agent has an explicit load instruction. Is this an artifact (inline content that should reference the skill) or is the skill file the artifact (written but never wired)?

3. **What is the discovery model for methodology skills?** Currently methodology skill `description` frontmatter registers them as slash commands, but calling `/adversarial-review` directly would be confusing for a user. Should methodology skills have a different registration mechanism?

4. **What is the right granularity for methodology skills?** `solid-principles` (157 lines, 5 principles) vs individual principle skills (5 × ~30 lines each)?

5. **Context window vs. discoverability trade-off**: How do plugin users extending the pipeline discover that `adversarial-review/SKILL.md` contains review conventions their new agent should follow?

6. **Should `team-brainstorm` extract its session protocol?** At 169 lines it is self-contained, but the intent clarification pattern could be a reusable methodology skill. No current second consumer exists.

7. **Impact on plugin distribution**: Is there a maximum context budget that should constrain how many methodology skills can be loaded per agent invocation?
