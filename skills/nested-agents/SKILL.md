---
name: nested-agents
description: Guardrails for spawning nested sub-agents from inside a Team pipeline agent (Claude Code >= 2.1.172) — loaded by researcher, implementer, code-reviewer, and security-reviewer. Nested dispatch is a context-economy optimization, never a dependency.
user-invocable: false
---

# Nested Sub-Agents — Guardrails

You are a Team pipeline agent that has been granted the `Agent` tool. The
orchestrator (the main session) dispatched you; you may dispatch helpers one
level further down. These rules are non-negotiable.

## Optimization, never a dependency

Nested spawning is new (Claude Code >= 2.1.172) and may be absent or capped
differently in the user's version. If the `Agent` tool is missing from your
toolset, a dispatch errors, or results never arrive: **do the work yourself
inline** with your other tools and proceed. Never stall, and never report
failure solely because nesting was unavailable.

## Version gate — check before the first nested dispatch

Nested dispatch requires **Claude Code >= 2.1.172**. Below that floor the
capability does not exist, so confirm the running version before you spawn
your first helper. Run the bundled deterministic check:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/nested-agents/supports-nesting.mjs" "$(claude --version)"
```

It prints `supported` and exits `0` when the version meets the floor, or
`unsupported` and exits non-zero otherwise. The check is **fail-closed**: an
older release, unrecognizable version output, or an environment where you
cannot run the check at all all count as `unsupported`. On any non-zero
result — i.e. whenever the version is less than 2.1.172 or undeterminable —
**do not spawn helpers; do the work yourself inline** per the rule above.
Run the gate once; a `supported` result holds for the rest of your turn.

## When to spawn vs. do it yourself (context economy)

Spawn a helper only when the side-quest would flood your context with
material you will not reference again — bulk file reading, tracing an
unfamiliar subsystem, verifying a claim against many call sites. If a handful
of targeted Reads or Greps answers the question, do it yourself; a sub-agent
that saves no context is pure overhead.

## Read-only by default

Dispatch read-only helper types: the built-in `Explore`, the plugin's
`team:file-finder`, or `general-purpose` with an explicitly read-only prompt.
Nested helpers NEVER write files, NEVER commit, and NEVER write anything
under `docs/plans/` — artifacts are written only by you or the orchestrator.

## Depth budget

You are at depth 2 of 5. Spawn at most ONE more level: instruct every helper
to do its work directly and never to spawn further sub-agents.

## Nested helpers are non-interactive — no envelopes

The open-questions envelope (`skills/agent-open-questions/SKILL.md`) works
exactly one level deep: the orchestrator parses only ITS direct child's final
message. An envelope emitted by your helper can never reach the user, so a
helper must never emit `openQuestions` — it would stall awaiting a resume
that cannot come. Never delegate question-asking downward. If a helper
surfaces an ambiguity, absorb it and raise it through YOUR own channel: your
own envelope (if your prompt has an interactive step) or your artifact's
open-questions section.

## Verification helpers get neutral claims

When using a helper to check your own finding, state the claim as a neutral,
falsifiable sentence with its `file:line` — never your verdict, severity, or
reasoning. Ask the helper to refute it with evidence. A helper that knows
your conclusion will anchor to it and verify nothing.

## Caps and ownership

- At most **4 helpers** in flight at once; prefer parallel dispatch of
  independent helpers in a single message.
- Bound every helper's reply (e.g. "return <= 30 lines of file:line
  findings").
- You own everything you report. Spot-verify helper claims before including
  them; a helper's error in your output is your error.
