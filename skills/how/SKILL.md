---
name: how
description: 'Explains subsystem architecture and runtime flow. Trigger on "how does X work", "walk me through", "explain the architecture", or "/how".'
effort: medium
argument-hint: "[<subsystem, feature, or question>]"
---

# How — Architectural Explanation

Explore the codebase to answer "how does X work?" Produce the mental
model a senior engineer needs to start working in an unfamiliar
subsystem — the architecture, the flow, and the sharp edges. Not
annotated source code.

Companion to `skills/why/SKILL.md`: `how` answers what the code does and
how it works; `why` answers what forces led to its shape. When the user
asks about motivation, rejected alternatives, or history, that is `why`'s
job.

This skill is **read-only**. It writes no files, records no artifacts,
and changes no state — in this session and in every subagent it
dispatches.

Two modes:

1. **Explain** (default) — explore and produce a clear explanation.
2. **Critique** — explain first, then dispatch fresh-context critics to
   judge the architecture.

## Procedure references

Read each reference completely when reaching that stage. Follow them in order; later stages depend on state and gates established earlier.

1. [Input](references/01-input.md)
2. [Explain mode](references/02-explain-mode.md)
3. [Output format](references/03-output-format.md)
4. [Critique mode](references/04-critique-mode.md)
5. [Rules](references/05-rules.md)

## Applied principles

Load and apply: `principle-generator-evaluator` and
`principle-optimization-never-dependency`.
