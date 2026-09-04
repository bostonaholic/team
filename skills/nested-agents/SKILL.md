---
name: nested-agents
description: 'Defines safe nested-agent dispatch and fallback. Load before agents spawn read-only scouts or cross-model couriers.'
user-invocable: false
---

# Nested Sub-Agents — Guardrails

Pipeline agents with `Agent` may dispatch helpers one level further down. These rules are non-negotiable.

## Optimization, never a dependency

If `Agent` is missing, dispatch fails, or results never arrive, do the work yourself inline and proceed. Never fail solely because nesting is unavailable (`principle-optimization-never-dependency`). Spawn only when bulk reading or tracing would add context you will not reuse; use targeted Reads/Greps directly otherwise.

## Version gate — confirm before the first nested dispatch

Nested dispatch requires **Claude Code >= 2.1.172**. `Agent` tool presence is the universal gate, including for agents without `Bash`. With `Bash`, run once:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/nested-agents/supports-nesting.mjs" "$(claude --version)"
```

Only `supported` with exit `0` permits nesting for the turn. Any non-zero, older or unrecognizable version, or unavailable check is `unsupported`: fail-closed, do not spawn, and work inline (`principle-fail-closed`).

## Dispatch invariants

- Helpers are read-only: built-in `Explore`, `team:file-finder`, or `general-purpose` with an explicitly read-only prompt. They NEVER write files, commit, or write under `docs/plans/`; the parent or orchestrator writes artifacts.
- Every call passes `model:`: `haiku` for location, grep, and bulk reading; `sonnet` for subsystem traces or claim checks; `opus` only after a `sonnet` helper was inconclusive, with that failure named. Effort: `low` for lookups, `medium` for tracing, never `xhigh`.
- You are at depth 2 of 5. Spawn at most ONE more level; every helper must work directly and never spawn (`principle-deep-agents-narrow-seams`).
- Helpers never ask users. Resolve ambiguity or record it in your artifact's open questions/assumptions (`principle-record-assumptions`).
- At most **4 helpers** may be in flight. Dispatch independent work in parallel. Bound each response. Spot-verify every reported claim; you own it.
- Use `SendMessage` for an in-scope follow-up to a live scout when available; it uses the same cap and reply bound. Otherwise respawn. Skeptics are always fresh and one-shot: one skeptic per claim (`principle-generator-evaluator`).

## Verification helpers get neutral claims

Apply `principle-blind-the-investigator`: send a neutral, falsifiable claim with `file:line`, never your verdict, severity, or reasoning, and ask the helper to refute it. **A rule-violation claim carries the rule** cited at `skills/<skill>/SKILL.md`. **Stated rule outranks observed precedent**; only a mismatched rule or an allowed case declared by that rule refutes the claim. Follow `skills/systems-thinking/SKILL.md` only where no written rule speaks. Drop or downgrade only a REFUTED result whose evidence you verify. Inconclusive means CONFIRMED. List removals under `### Refuted by verification`.

Before `researcher`, `implementer`, `code-reviewer`, or `security-reviewer` dispatches helpers, read [references/per-agent-dispatch.md](references/per-agent-dispatch.md) for exact types, prompt contents, templates, caps, and fallback rules.

### `code-reviewer` — vendor couriers (cross-model pass)

Each vendor `run` uses one read-only `Explore` courier named `codex-review` or `agy-review`, per `skills/cross-model-review/SKILL.md`. Couriers return stdout, write and spawn nothing, and count toward the 4-helpers-in-flight cap. The vendor process follows that skill's pinned argv, env allowlist, post-pass tree check, and inline fallback.
