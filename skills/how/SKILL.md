---
name: how
description: |
  Read-only explanation or critique of code structure and runtime behavior.
  Trigger on "how does X work", "walk me through", "explain the
  architecture", "where should this live", or "/how". Use `why` for history.
effort: medium
argument-hint: "[<subsystem, feature, or question>]"
---

# How

Explain code at senior-engineer onboarding depth. Write nothing and run no
state-changing command in this session or any subagent.

## Input

Resolve `$ARGUMENTS` as a subsystem, runtime flow, or placement question. For
empty or vague input, infer the target from conversation, open files, and
recent edits; state that interpretation in one line and continue.

Requests for problems or improvements select **Critique**; all others select
**Explain**. For motivation, rejected alternatives, or history, call the Skill
tool with `why`.

## Explain

Call the Skill tool with `principle-progress-tracking` and follow it.

1. For one function or module, inspect inline. For a cross-file subsystem,
   split the question into 2–4 independent topics and read
   `references/investigation.md`.
2. Dispatch all topics together to fresh read-only `Explore` subagents using
   `model: sonnet`. If unavailable, investigate every topic inline and report
   the fallback; never use a write-capable substitute.
3. Check contradictions against source. Every code claim cites `file:line`;
   every flow step names the function that executes it. State unresolved gaps.
4. Return only useful sections: **Overview**, **Key Concepts**,
   **How It Works**, **Where Things Live**, and **Gotchas**. Omit empty
   sections. Use a diagram only when several component interactions are clearer
   visually.

## Critique

Complete Explain first. Then read the critic section in
`references/investigation.md` and dispatch its three fresh read-only critics
together. If dispatch is unavailable, apply the lenses inline and say so.

Return the explanation first. Then classify each supported architectural
finding as **Act on**, **Consider**, **Noted**, or **Dismissed**, with code
evidence and dismissal reasons. Keep line-level review in `code-review`; do not
recommend a rewrite without a demonstrated problem.

## Completion

Answer the question, cite the inspected code, name gaps and skipped dispatches,
and confirm no state changed.
