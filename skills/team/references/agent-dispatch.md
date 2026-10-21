# Nested Sub-Agents — Guardrails

Before each consuming step, read its linked shared rules from the installed `skills/team/` directory.
If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

Pipeline agents with `Agent` may dispatch helpers one level down under these non-negotiable rules.

## Optimization, never a dependency

If `Agent` is missing, dispatch fails, or results never arrive, do the work inline and proceed; never fail because nesting is unavailable ([focused work rules](principles/focused-work.md)). Spawn only when bulk reading or tracing would add context you will not reuse; otherwise use targeted Reads/Greps.

## Version gate — confirm before the first nested dispatch

Nested dispatch requires **Claude Code >= 2.1.172**. `Agent` tool presence is the universal gate, including for agents without `Bash`. With `Bash`, run once:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/team/references/supports-nesting.mjs" "$(claude --version)"
```

Only `supported` with exit `0` permits nesting for the turn. Anything else, or an unavailable check, is `unsupported`: fail closed, do not spawn, work inline ([verified results rules](principles/verified-results.md)).

## Dispatch invariants

For Team helpers, read [host dispatch](references/15-host-dispatch.md) before named or body-loaded dispatch.
Supply the installed root, definition, and applicable resource paths, as operational context, in every initial and follow-up prompt.

- Helpers are read-only: built-in `Explore`, `team:file-finder`, or `general-purpose` with an explicitly read-only prompt. They NEVER write files, commit, or write under `docs/plans/`; the parent or orchestrator writes artifacts.
- Every call passes `model:`: `haiku` for location, grep, and bulk reading; `sonnet` for subsystem traces or claim checks; `opus` only after a `sonnet` helper was inconclusive, with that failure named. Effort: `low` for lookups, `medium` for tracing, never `xhigh`.
- You are at depth 2 of 5. Spawn at most ONE more level; every helper works directly and never spawns ([focused work rules](principles/focused-work.md)).
- Helpers never ask users. Resolve ambiguity or record it in your artifact's open questions/assumptions ([decisions rules](references/decisions.md)).
- At most **4 helpers** in flight. Dispatch independent work in parallel. Spot-verify every reported claim; you own it.
- Use `SendMessage` for an in-scope follow-up to a live scout when available (same in-flight cap); otherwise respawn. Skeptics are always fresh and one-shot: one skeptic per claim ([independent review rules](principles/independent-review.md)).

## Prose procedure for non-vendor helpers

Before dispatching a `team:file-finder`, `Explore`, or `general-purpose` helper, the parent Reads the installed [writing standards](references/writing.md) and puts its absolute path and this ordered audit in every initial and follow-up prompt, as operational method text, not task-derived Research content: the helper Reads the standards before finalizing its report, saves its untouched draft, records the checklist, applies the style rules, resolves the checklist, rescans, and self-audits, leaving source text and exact contracts unchanged.

If the parent or helper cannot Read it, discard that helper's return: a scout parent works inline; a skeptic parent keeps the unverified finding under default-keep.

## Verification helpers get neutral claims

Per [independent review rules](principles/independent-review.md), send a neutral, falsifiable claim with `file:line` and ask the helper to refute it. **A rule-violation claim carries the rule** cited at `skills/<skill>/SKILL.md`. **Stated rule outranks observed precedent**: only a mismatched rule or an allowed case declared by that rule refutes the claim; apply [system dependency checks](references/dependencies.md) only where no written rule speaks. Drop or downgrade only a REFUTED result whose evidence you verify; inconclusive means CONFIRMED. List removals under `### Refuted by verification`.

## Per-agent nested dispatch

### `researcher` — exploration scouts

Fan out read-only exploration when questions cluster into independent areas or `4-repos.md` lists multiple repos; handle one or two pointed questions directly.

- Scout types: `team:file-finder` or built-in `Explore`; nothing else.
- Spawn only when a cluster needs more reading than the report will quote.
- Isolation extends downward: scout prompts and follow-ups carry task-derived content only as the [independent review rules](principles/independent-review.md) "Neutral investigation" allow (verbatim `2-questions.md` text, its `Codebase context`, `4-repos.md` slugs/paths). Never mention `1-task.md`.
- At most 4 scouts, preferably parallel. Each returns `file:line` findings and spawns nothing; the researcher folds that evidence, `file:line` preserved, into its own return.

### `code-reviewer` and `security-reviewer` — skeptic passes

A hard gate is a Blocking-tier `issue:` for code review or CRITICAL/HIGH for security. Before reporting one, send it to a fresh `general-purpose` skeptic: one per finding, at most 4 in flight; batch overflow into one dispatch. Preserve `REFUTED` or `CONFIRMED` and `file:line` evidence.

For code or exploitability claims:

> Read <file> around line <n>. Claim: "<one-sentence falsifiable statement, e.g. `user` may be null on the early-return path>". Attempt to REFUTE this claim with concrete evidence (guards, callers, sanitization, validation layers, type definitions, tests). Reply REFUTED or CONFIRMED with file:line evidence. If your evidence is inconclusive, reply CONFIRMED. Do not write files or spawn agents.

For rule violations, name the rule but omit verdict and severity:

> Read <file> around line <n>. Claim: "<what is there> violates <rule>, stated in `skills/<skill>/SKILL.md`". Read that rule, then attempt to REFUTE the claim: does the rule say what the claim says, and does this code fall outside it through an allowed case declared by the rule or because the rule does not reach this case? Reply REFUTED or CONFIRMED with file:line evidence. If your evidence is inconclusive, reply CONFIRMED. Do not write files or spawn agents.

A conflict between convention and rule is a report finding, not a refutation.

Skip skepticism only with no hard-gate findings or no `Agent`; then report findings unchanged. Never soften a finding over unavailable or inconclusive verification.

### `code-reviewer` — vendor couriers (cross-model pass)

Each vendor `run` uses one read-only `Explore` courier named `codex-review` or `agy-review`, per [cross-model review](references/cross-model-review.md), which owns the pinned argv, env allowlist, post-pass tree check, and inline fallback. Couriers write and spawn nothing, count toward the 4-helper cap, neither receive nor Read the writing standards, and relay vendor stdout byte-for-byte.

### `implementer` — read-only scouts

Spawn a built-in `Explore` or `team:file-finder` scout when a slice touches a subsystem the plan does not explain and direct mapping would mean reading more than ~3 files you will not edit.

- At most 2 scouts in flight. Each returns `file:line` findings and spawns nothing.
- Run scouts in the background: dispatch for the next unfamiliar slice while completing the current one, then collect when that slice starts.
- Scouts never write, edit, commit, implement a slice, or run the fix loop.
