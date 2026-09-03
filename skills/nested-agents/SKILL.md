---
name: nested-agents
description: Safely delegate bounded read-only work from eligible Team agents.
user-invocable: false
---

# Nested Agents

These rules apply to `researcher`, `implementer`, `code-reviewer`, and
`security-reviewer` when they hold the Agent tool.

## Version gate

Nesting requires Claude Code >= 2.1.172. Tool presence is the universal gate:
if Agent is absent from your toolset, do the work yourself inline.

If you also hold Bash, run once before the first dispatch:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/nested-agents/supports-nesting.mjs" "$(claude --version)"
```

Only `supported` with exit 0 permits nesting for the turn. Any older,
unparseable, or uncheckable version is unsupported: fail-closed and do the
work yourself inline (`skills/principle-fail-closed/SKILL.md`).

## Shared dispatch rules

- Spawn only when bulk reading or tracing would consume context you will not
  use again. Do targeted reads yourself.
- Use read-only `Explore`, `team:file-finder`, or `general-purpose` with an
  explicitly read-only prompt. Helpers never edit, commit, or write under
  `docs/plans/`.
- Pass `model:` every time: `haiku` for lookup/bulk maps, `sonnet` for tracing
  or a single-claim skeptic, `opus` only after an inconclusive sonnet attempt.
  Use low effort for lookups, medium for tracing, never xhigh.
- You are at depth 2 of 5. Spawn at most ONE more level and tell every helper
  not to spawn (`skills/principle-deep-agents-narrow-seams/SKILL.md`).
- Helpers are non-interactive. Resolve ambiguity yourself and record the
  assumption; never delegate a user question
  (`skills/principle-record-assumptions/SKILL.md`).
- Keep at most **4 helpers** in flight. Dispatch independent work in parallel.
- Bound every response. Spot-verify every claim; you own the output.
- Missing Agent, dispatch error, or missing result never fails the task: do the
  work yourself inline
  (`skills/principle-optimization-never-dependency/SKILL.md`).

For a live scout already covering the needed subsystem, prefer SendMessage to
a respawn when available. The follow-up obeys the same bounds. Skeptics are
always fresh and one-shot
(`skills/principle-generator-evaluator/SKILL.md`).

## Verification helpers

Apply `skills/principle-blind-the-investigator/SKILL.md`. Give a neutral,
falsifiable claim with `file:line`, without verdict, severity, or reasoning,
and ask the helper to refute it.

### `researcher` — scouts

- Use only `team:file-finder` or `Explore` for independent question clusters,
  multi-repo work, or reading whose details will not enter the report.
- A scout prompt may contain only question text copied verbatim from
  `2-questions.md`, its Codebase context, and repo slugs/paths from `4-repos.md`.
  Never include `1-task.md`, intent, or added framing. The same holds for
  follow-ups.
- At most 4 scouts; each returns <= 30 lines of `file:line` findings and spawns
  no agents. The researcher's 100-line report cap includes all scout output.

### `code-reviewer` and `security-reviewer` — skeptics

Before reporting a hard-gate finding (`issue (blocking)` or CRITICAL/HIGH),
send it to a fresh `general-purpose` skeptic. One helper per finding; at most
4 in flight, with overflow batched once.

Prompt:

> Read `<file>` around line `<n>`. Claim: "<neutral falsifiable statement>".
> Attempt to REFUTE it using guards, callers, sanitization, validation, types,
> and tests. Reply REFUTED or CONFIRMED with file:line evidence, <= 10 lines.
> Inconclusive means CONFIRMED. Do not write files or spawn agents.

**A rule-violation claim carries the rule.** Use:

> Read `<file>` around line `<n>`. Claim: "<what is there> violates <rule>,
> stated in `skills/<skill>/SKILL.md`". Read the rule, then attempt to REFUTE:
> does the rule differ, or does its stated exemption cover this code? Reply
> REFUTED or CONFIRMED with file:line evidence, <= 10 lines. Inconclusive means
> CONFIRMED. Do not write files or spawn agents.

**A stated rule outranks observed precedent.** Existing violations do not
refute a rule. Only a different rule meaning or its stated exemption does.
Follow conventions where no rule speaks; follow the rule where it does. This
qualifies the system-fit lens in `skills/systems-thinking/SKILL.md`.

**Default-keep:** drop or downgrade only after REFUTED evidence that you verify.
Inconclusive keeps the finding and severity. Record refutations under
`### Refuted by verification`. Skip only when no hard finding exists or Agent
is unavailable; never soften a finding because the pass skipped. The pass must
never remove a true positive.

### `code-reviewer` — vendor couriers

For cross-model review, use one `Explore` courier per ready CLI, named
`codex-review` or `agy-review`, exactly as
`skills/cross-model-review/SKILL.md` specifies. Each runs the pinned command,
returns stdout verbatim, writes nothing, and spawns nothing. Couriers count
against the 4-helpers-in-flight cap. Use that skill's inline fallback.

### `implementer` — scouts

Use `Explore` or `team:file-finder` only when an unexplained subsystem would
require reading more than about three files you will not edit. At most 2 scouts
in flight; each returns <= 30 lines of `file:line` findings and spawns no
agents. Start a next-slice scout while completing the current slice when useful.
Scouts never edit, commit, implement a slice, or run the fix loop.

## Done

All helper claims used in output were verified; helper caps, model choice,
read-only bounds, depth, isolation, and inline fallback were honored.
