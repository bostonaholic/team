---
topic: code-comment-rules
date: 2026-07-31
phase: task
ticketId: null
---

# Task: code-comment-rules

## Description
Incorporate the following rule set for writing and reviewing code comments,
verbatim as given:

# Code Comment Rules

1. **Prefer self-explanatory code**
   * Improve names, structure, and abstractions before adding a comment.
   * Do not use comments to compensate for confusing code.

2. **Explain why, not what**
   * Comments should describe intent, constraints, tradeoffs, or non-obvious reasoning.
   * Do not restate behavior that is already clear from the code.

3. **Write timeless comments**
   * Describe the code as it exists now.
   * Do not include dates, corrections, changelog entries, or historical narration.
   * Avoid phrases such as: "Previously", "Originally", "As of", "Correction", "Temporary fix from", "This was changed because".

4. **Do not narrate edits**
   * Never describe what you just added, removed, renamed, or fixed.
   * Comments belong to the resulting code, not the editing process.

5. **Avoid references to the conversation**
   * Do not mention the user, prompt, ticket discussion, review feedback, or agent instructions.
   * Comments must make sense without external conversational context.

6. **Document non-obvious constraints**
   * Add comments when behavior is shaped by: external API limitations, compatibility requirements, security assumptions, performance tradeoffs, ordering guarantees, concurrency concerns, unexpected framework behavior.

7. **Document deliberate oddities**
   * Explain code that looks incorrect, redundant, or unnecessarily complex but is intentional.
   * State the consequence of removing or simplifying it.

8. **Keep comments local**
   * Place comments as close as possible to the code they explain.
   * Do not describe behavior implemented far away unless linking them is necessary for correctness.

9. **Keep comments concise**
   * Use the minimum text needed to preserve important reasoning.
   * Prefer one clear sentence over a paragraph.

10. **Use precise language**
    * Avoid vague statements such as: "Handle edge case", "Fix weird issue", "Do this for safety", "Needed for some reason".
    * Name the exact condition, risk, or dependency.

11. **Do not speculate**
    * Only document behavior and constraints that are verified.
    * Do not invent motives for existing code.

12. **Do not duplicate documentation**
    * Avoid repeating information already expressed by types, tests, function names, or public documentation.
    * Link to an external specification only when the code depends on a precise external contract.

13. **Avoid fragile references**
    * Do not refer to line numbers, nearby code positions, or file layouts likely to change.
    * Prefer symbols, concepts, or stable identifiers.

14. **Treat TODO comments as actionable work**
    * A TODO must explain: what remains to be done, why it cannot be done now, what condition would allow it to be completed.
    * Include an issue identifier when one exists.
    * Do not add speculative or open-ended TODOs.

15. **Remove obsolete comments**
    * Update or delete comments whenever the associated behavior changes.
    * A misleading comment is worse than no comment.

16. **Preserve existing comment style**
    * Follow the repository's established conventions for tone, formatting, punctuation, and documentation syntax.

17. **Use documentation comments only for public contracts**
    * Document exported APIs, externally visible behavior, required invariants, and important failure modes.
    * Do not generate documentation comments that merely repeat a function signature.

18. **Do not add comments by default**
    * Add a comment only when it preserves information that cannot be expressed clearly in the code itself.

## Decision Test

Before adding a comment, ask:
1. Can the code be made clearer instead?
2. Does the comment explain information not visible in the code?
3. Will the comment remain accurate without historical context?
4. Would a future maintainer be likely to misunderstand or remove this code without the comment?

Add the comment only when the answers justify it.

**Clarification (from the requester):** this repository is the Team plugin
itself (a Claude Code plugin of agents and skills). "Incorporate" means these
rules become part of how the plugin's own agents write and review code
comments during runs — the delivery mechanism (which skill/agent files
carry the text, how it is worded, how existing tests stay in sync) is left
to the design phase, not decided here.

## Stated goal
Make the plugin's agents write and review in-source code comments according
to this full 18-rule set instead of whatever narrower rule set they follow
today.

## Inferred goal
Close the gap between the plugin's current, terser comment-discipline
guidance and this more complete rule set, so that both the agent that writes
code (implementer) and the agent that reviews it (code-reviewer) hold the
same fuller standard — without breaking the existing test/eval scaffolding
that already asserts the current, narrower rules.

## Acceptance signals
- The plugin's canonical comment-rule text visibly covers concerns the
  current text does not name today (e.g., timelessness, non-narration, no
  conversational references, deliberate-oddity documentation, precise
  language, non-speculation, fragile-reference avoidance, a decision test).
- The reviewer's comment-related checklist/red-flag findings can cite the
  fuller rule set, not just the subset it flags today.
- Existing tests, eval fixtures, and rubrics that pin the current rule
  wording are updated to match rather than left contradicting the new text.
- No new comment-writing/reviewing mechanism is invented beyond the
  skill-plus-checklist pattern the plugin already uses elsewhere.

## Open assumptions
- Single-repo scope: the description names no second repository or
  directory, so this stays scoped to the current repo (the Team plugin).
- Rule 14 ("Treat TODO comments as actionable work," which describes a
  required TODO structure) reads in tension with the plugin's current
  hard ban on any TODO/FIXME comment in delivered code. This is flagged
  here as an open conflict for the design phase to resolve — it is not
  resolved in this task.
- "Incorporate" is read as updating the plugin's existing comment-related
  guidance and its existing test/eval scaffolding to match, not as
  building new tooling (e.g., a language-specific comment linter).
