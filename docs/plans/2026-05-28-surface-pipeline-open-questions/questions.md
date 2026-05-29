---
topic: surface-pipeline-open-questions
date: 2026-05-28
phase: questions
---

# Research Questions: surface-pipeline-open-questions

## Codebase context
- Scope: `agents/` (all 13 agent `.md` files), `skills/team/SKILL.md`,
  `skills/team-design/SKILL.md`, `skills/qrspi-workflow/SKILL.md`
- Vocabulary:
  - *subagent* — an agent dispatched by the orchestrator via the Claude Code
    agent dispatch mechanism; runs in its own context
  - *AskUserQuestion* — a built-in Claude Code tool that renders a structured
    multi-choice prompt to the user and returns the selected option
  - *tools frontmatter* — the `tools:` field in an agent's YAML frontmatter
    that declares which tools the agent is permitted to call
  - *orchestrator* — the main Claude Code session running `skills/team/SKILL.md`;
    not a subagent
  - *prose question block* — a markdown-formatted list of questions emitted as
    plain text output rather than via a tool call

## Topology

1. Which agents in `agents/` declare `AskUserQuestion` in their `tools:`
   frontmatter, and which do not?

2. What do the agents that declare `AskUserQuestion` say in their prompt body
   about when and how to call that tool? Quote the relevant instruction text
   verbatim.

3. What does the orchestrator (`skills/team/SKILL.md`) say about how it treats
   text output returned from a subagent versus structured tool calls made by
   that subagent? Is there any section describing how subagent output is
   consumed or relayed?

4. When the orchestrator dispatches a subagent, does the dispatch mechanism
   (as documented in the skill files or agent files) indicate whether tool
   calls made inside the subagent are visible to the orchestrator, to the
   user, or neither?

## Conventions

5. How does the orchestrator itself call `AskUserQuestion`? Identify every
   location in `skills/team/SKILL.md` where `AskUserQuestion` is called or
   referenced, and describe the surrounding context (which phase, what
   question is asked, how the result is used).

6. What pattern do agents that do NOT declare `AskUserQuestion` use when they
   encounter ambiguity or a decision they cannot resolve autonomously?
   Identify specific examples from `agents/structure-planner.md`,
   `agents/planner.md`, and any reviewer agents.

7. Is there any existing documentation in `skills/` or `agents/` that
   distinguishes between tool calls an orchestrator makes versus tool calls a
   subagent makes, particularly regarding user-facing interactions?

## Constraints

8. What prompt language in `agents/design-author.md` is meant to enforce that
   `AskUserQuestion` is called before the design document is written? Is the
   instruction phrased as a precondition, a rule, or a suggestion? Quote
   the relevant text.

9. Does any agent file include language that describes a fallback behavior —
   what to do if `AskUserQuestion` cannot be called or if the tool is
   unavailable? If so, quote it.

10. What does `skills/qrspi-workflow/SKILL.md` say about how agents
    communicate decisions or ambiguities back to the orchestrator?

## Reference points

11. In `skills/team/SKILL.md`, the orchestrator calls `AskUserQuestion` at the
    design-approval human gate. What is the exact call structure (question
    text, header, options) and what happens to the returned value?

12. Is there any agent or skill in this codebase that successfully demonstrates
    an interactive pattern — where a subagent (not the orchestrator) surfaces
    a question and the result shapes subsequent output? If so, where?
