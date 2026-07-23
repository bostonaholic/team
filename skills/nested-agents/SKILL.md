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

## Version gate — confirm before the first nested dispatch

Nested dispatch requires **Claude Code >= 2.1.172**. Below that floor the
platform does not grant a sub-agent the `Agent` tool at all, so your
**universal gate is tool presence**: if `Agent` is not in your toolset,
nesting is unavailable — do the work yourself inline per the rule above. This
gate needs no command and holds for every agent, including read-only ones that
have no `Bash` tool.

When you also hold the `Bash` tool, additionally confirm the running version
with the bundled deterministic check — it pins the exact floor rather than
trusting tool presence alone:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/nested-agents/supports-nesting.mjs" "$(claude --version)"
```

It prints `supported` and exits `0` at or above the floor, or `unsupported`
and exits non-zero otherwise. The check is **fail-closed**: an older release,
unrecognizable version output, or an environment where you cannot run the
check all count as `unsupported`. On any non-zero result — i.e. whenever the
version is less than 2.1.172 or undeterminable — **do not spawn helpers; do
the work yourself inline.** Run the gate once; a `supported` result holds for
the rest of your turn.

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

## Per-agent caps

### Code reviewer and security reviewer — skeptic passes

A false hard-gate finding costs an entire review round: an implementer
re-dispatch plus a fresh run of all 5 reviewers. Before finalizing a
hard-gate finding (a Blocking-tier `issue:` for the code-reviewer; a
CRITICAL or HIGH finding for the security-reviewer), hand it to a fresh
skeptic sub-agent via the `Agent` tool and try to get it refuted.

- Dispatch one `general-purpose` sub-agent per hard-gate finding (at most
  4 in flight; batch any overflow into one dispatch).
- **State the claim neutrally** — file:line plus a falsifiable sentence.
  Never include your verdict, severity, or reasoning. Template:

  > Read <file> around line <n>. Claim: "<one-sentence falsifiable
  > statement, e.g. `user` may be null on the early-return path>".
  > Attempt to REFUTE this claim with concrete evidence (guards, callers,
  > type definitions, tests). Reply REFUTED or CONFIRMED with file:line
  > evidence, <= 10 lines. If your evidence is inconclusive, reply
  > CONFIRMED. Do not write files or spawn agents.

- **Default-keep.** Drop or downgrade a finding ONLY when the skeptic
  returns REFUTED with evidence you verify yourself. Inconclusive means the
  finding stands — severity is never softened on an uncertain skeptic
  reply. The pass removes false positives; it must never remove a true
  positive. List refuted findings under a `### Refuted by verification`
  section of your report (auditable, not silently dropped).
- Skip the pass when there are no hard-gate findings or the Agent tool is
  unavailable — report findings as-is. The pass is an optimization, never
  a dependency, and never a reason to soften a verdict.

### Implementer — read-only scouts

Spawn a read-only scout when a slice touches a subsystem the plan does not
explain and mapping it yourself would mean reading more than ~3 files you
will not edit. The scout absorbs the bulk reading and returns a short map,
keeping your context lean across slices.

- **Scout types:** the built-in `Explore` agent or `team:file-finder`.
- **Caps:** at most 2 scouts in flight; each instructed to return <= 30
  lines of file:line findings and to spawn no further agents.
- **Scouts never write, edit, or commit.** All code, tests, and commits
  remain yours. Never dispatch a sub-agent to implement a slice or to run
  the fix loop.
