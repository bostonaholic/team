---
name: how
description: 'Use for explaining subsystem architecture or runtime flow.'
effort: medium
argument-hint: "[<subsystem, feature, or question>]"
---

# How — Architectural Explanation

Before each consuming step, read its linked shared rules from this installed skill directory.
If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

Answer "how does X work?" with the mental model a senior engineer needs to
start working in an unfamiliar subsystem: its architecture, flow, and sharp
edges, not annotated source code.

Companion to `skills/why/SKILL.md`: when the question is about motivation,
rejected alternatives, or history rather than mechanics, call the Skill
tool with `why` instead.

This skill is **read-only**: it writes no files, records no artifacts
(none under `docs/plans/`), and changes no state — in this session and in
every subagent it dispatches.

Modes: **Explain** (default), or **Critique** — explain first, then
dispatch fresh-context critics to judge the architecture.

## Procedure references

Read each reference completely when reaching that stage. Follow them in order; later stages depend on state and gates established earlier.

1. [Input](references/01-input.md)
2. [Explain mode](references/02-explain-mode.md)
3. [Output format](references/03-output-format.md)
4. [Critique mode](references/04-critique-mode.md)

## Applied principles

Read and apply: [independent review rules](../team/principles/independent-review.md) and
[focused work rules](../team/principles/focused-work.md).
