---
name: nested-agents
description: 'Defines safe nested-agent dispatch and fallback. Load before agents spawn read-only scouts or cross-model couriers.'
user-invocable: false
---

# Nested Sub-Agents — Guardrails

Before each consuming step, read its linked shared rules from this installed skill directory.
If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

Pipeline agents with `Agent` may dispatch helpers one level further down. These rules are non-negotiable.

## Optimization, never a dependency

If `Agent` is missing, dispatch fails, or results never arrive, do the work yourself inline and proceed. Never fail solely because nesting is unavailable ([focused work rules](../team/principles/focused-work.md)). Spawn only when bulk reading or tracing would add context you will not reuse; use targeted Reads/Greps directly otherwise.

## Version gate — confirm before the first nested dispatch

Nested dispatch requires **Claude Code >= 2.1.172**. `Agent` tool presence is the universal gate, including for agents without `Bash`. With `Bash`, run once:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/nested-agents/supports-nesting.mjs" "$(claude --version)"
```

Only `supported` with exit `0` permits nesting for the turn. Any non-zero, older or unrecognizable version, or unavailable check is `unsupported`: fail-closed, do not spawn, and work inline ([verified results rules](../team/principles/verified-results.md)).

## Dispatch invariants

For Team helpers, read [host dispatch](../team/references/15-host-dispatch.md) before named or body-loaded dispatch.
Supply the installed root, definition, and applicable resource paths in every initial and follow-up prompt.
These paths are operational context. Research task-derived inputs stay restricted to neutral questions and repository context.
Keep the helper restrictions and inline fallback below.

Before dispatching a non-vendor helper, the parent resolves and Reads these
four installed, read-only files. Pass the resolved absolute paths in every
initial or follow-up prompt:

- `${CLAUDE_PLUGIN_ROOT}/skills/unslop/SKILL.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/unslop/references/rules.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/writing-prose/SKILL.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/writing-prose/references/style-guide.md`

The helper Reads all four before finalizing prose. If the parent or helper
cannot Read one, discard that helper return. A scout parent does the reading
inline. A reviewer keeps the unverified finding under the skeptic default-keep
rule. Vendor couriers do not Read prose files and relay stdout byte-for-byte.
These fixed paths and audit instructions are operational method text, not
task-derived Research content.

- Helpers are read-only: built-in `Explore`, `team:file-finder`, or `general-purpose` with an explicitly read-only prompt. They NEVER write files, commit, or write under `docs/plans/`; the parent or orchestrator writes artifacts.
- Every call passes `model:`: `haiku` for location, grep, and bulk reading; `sonnet` for subsystem traces or claim checks; `opus` only after a `sonnet` helper was inconclusive, with that failure named. Effort: `low` for lookups, `medium` for tracing, never `xhigh`.
- You are at depth 2 of 5. Spawn at most ONE more level; every helper must work directly and never spawn ([focused work rules](../team/principles/focused-work.md)).
- Helpers never ask users. Resolve ambiguity or record it in your artifact's open questions/assumptions ([decisions rules](../team/references/decisions.md)).
- At most **4 helpers** may be in flight. Dispatch independent work in parallel. Bound each response. Spot-verify every reported claim; you own it.
- Use `SendMessage` for an in-scope follow-up to a live scout when available; it uses the same cap and reply bound. Otherwise respawn. Skeptics are always fresh and one-shot: one skeptic per claim ([independent review rules](../team/principles/independent-review.md)).

## Verification helpers get neutral claims

Apply [independent review rules](../team/principles/independent-review.md): send a neutral, falsifiable claim with `file:line`, never your verdict, severity, or reasoning, and ask the helper to refute it. **A rule-violation claim carries the rule** cited at `skills/<skill>/SKILL.md`. **Stated rule outranks observed precedent**; only a mismatched rule or an allowed case declared by that rule refutes the claim. Follow `skills/systems-thinking/SKILL.md` only where no written rule speaks. Drop or downgrade only a REFUTED result whose evidence you verify. Inconclusive means CONFIRMED. List removals under `### Refuted by verification`.

Before `researcher`, `implementer`, `code-reviewer`, or `security-reviewer` dispatches helpers, read [references/per-agent-dispatch.md](references/per-agent-dispatch.md) for exact types, prompt contents, templates, caps, and fallback rules.

### `code-reviewer` — vendor couriers (cross-model pass)

Each vendor `run` uses one read-only `Explore` courier named `codex-review` or `agy-review`, per `skills/cross-model-review/SKILL.md`. Couriers return stdout, write and spawn nothing, and count toward the 4-helpers-in-flight cap. The vendor process follows that skill's pinned argv, env allowlist, post-pass tree check, and inline fallback.
