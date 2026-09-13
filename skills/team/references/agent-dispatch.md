# Nested Sub-Agents — Guardrails

Before each consuming step, read its linked shared rules from this installed references directory.
If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

Pipeline agents with `Agent` may dispatch helpers one level further down. These rules are non-negotiable.

## Optimization, never a dependency

If `Agent` is missing, dispatch fails, or results never arrive, do the work yourself inline and proceed. Never fail solely because nesting is unavailable ([focused work rules](principles/focused-work.md)). Spawn only when bulk reading or tracing would add context you will not reuse; use targeted Reads/Greps directly otherwise.

## Version gate — confirm before the first nested dispatch

Nested dispatch requires **Claude Code >= 2.1.172**. `Agent` tool presence is the universal gate, including for agents without `Bash`. With `Bash`, run once:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/team/references/supports-nesting.mjs" "$(claude --version)"
```

Only `supported` with exit `0` permits nesting for the turn. Any non-zero, older or unrecognizable version, or unavailable check is `unsupported`: fail-closed, do not spawn, and work inline ([verified results rules](principles/verified-results.md)).

## Dispatch invariants

For Team helpers, read [host dispatch](15-host-dispatch.md) before named or body-loaded dispatch.
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
- You are at depth 2 of 5. Spawn at most ONE more level; every helper must work directly and never spawn ([focused work rules](principles/focused-work.md)).
- Helpers never ask users. Resolve ambiguity or record it in your artifact's open questions/assumptions ([decisions rules](references/decisions.md)).
- At most **4 helpers** may be in flight. Dispatch independent work in parallel. Bound each response. Spot-verify every reported claim; you own it.
- Use `SendMessage` for an in-scope follow-up to a live scout when available; it uses the same cap and reply bound. Otherwise respawn. Skeptics are always fresh and one-shot: one skeptic per claim ([independent review rules](principles/independent-review.md)).

## Verification helpers get neutral claims

Apply [independent review rules](principles/independent-review.md): send a neutral, falsifiable claim with `file:line`, never your verdict, severity, or reasoning, and ask the helper to refute it. **A rule-violation claim carries the rule** cited at `skills/<skill>/SKILL.md`. **Stated rule outranks observed precedent**; only a mismatched rule or an allowed case declared by that rule refutes the claim. Follow [system dependency checks](references/dependencies.md) only where no written rule speaks. Drop or downgrade only a REFUTED result whose evidence you verify. Inconclusive means CONFIRMED. List removals under `### Refuted by verification`.

## Per-agent nested dispatch

Read the shared invariants above first. This section is mandatory before the relevant agent dispatches helpers.

### Prose procedure for non-vendor helpers

Before dispatch, the parent resolves and Reads these installed files, then puts
all four resolved absolute paths in the initial or follow-up prompt:

- `${CLAUDE_PLUGIN_ROOT}/skills/unslop/SKILL.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/unslop/references/rules.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/writing-prose/SKILL.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/writing-prose/references/style-guide.md`

Every `team:file-finder`, `Explore`, and `general-purpose` prompt tells the
helper to Read all four before finalizing its authored report. The helper saves
its untouched authored draft, records the `unslop` checklist, applies
`writing-prose`, resolves the checklist, rescans, and self-audits. Source text
and exact contracts remain unchanged. If any Read fails, the parent discards
the return. A scout parent works inline. A skeptic parent applies default-keep.

### `researcher` — exploration scouts

Fan out read-only exploration when questions cluster into independent areas or `4-repos.md` lists multiple repos.

- Scout types: `team:file-finder` or built-in `Explore`; nothing else.
- Include the four prose paths and ordered audit in every initial and follow-up
  prompt. Preserve `file:line` evidence and the <= 40 lines cap.
- The isolation invariant extends downward. Restrict task-derived content in
  prompts and follow-ups to question text copied verbatim from
  `2-questions.md`, its `Codebase context`, and repo slugs/paths from
  `4-repos.md`. The fixed prose paths, ordered audit, read-only tool rules,
  caps, and output contract above are allowed operational method text. Never
  add task framing, mention `1-task.md`, or speculate about intent.
- Spawn only when a cluster requires more reading than the report will quote. Handle one or two pointed questions directly.
- At most 4 scouts, preferably parallel. Each returns <= 40 lines of
  `file:line` findings and spawns nothing. The researcher compresses their
  evidence within its 60-line single-repo or 100-line multi-repo producer
  budget.

### `code-reviewer` and `security-reviewer` — skeptic passes

A hard gate is Blocking-tier `issue:` for code review or CRITICAL/HIGH for security. Before reporting one, send it to a fresh `general-purpose` skeptic: one per finding, at most 4 in flight; batch overflow into one dispatch.

- Include the four prose paths and ordered audit in every skeptic prompt.
  Preserve `REFUTED` or `CONFIRMED`, `file:line` evidence, and the <= 10 lines
  cap.

Use this template for code or exploitability claims:

> Read <file> around line <n>. Claim: "<one-sentence falsifiable statement, e.g. `user` may be null on the early-return path. Or, for a security finding, user input from the `q` parameter reaches this SQL string without parameterization>". Attempt to REFUTE this claim with concrete evidence (guards, callers, sanitization, validation layers, type definitions, tests). Reply REFUTED or CONFIRMED with file:line evidence, <= 10 lines. If your evidence is inconclusive, reply CONFIRMED. Do not write files or spawn agents.

For rule violations, name the rule but omit verdict and severity:

> Read <file> around line <n>. Claim: "<what is there> violates <rule>, stated in `skills/<skill>/SKILL.md`". Read that rule, then attempt to REFUTE the claim: does the rule say what the claim says, and does this code fall outside it through an allowed case declared by the rule or because the rule does not reach this case? Reply REFUTED or CONFIRMED with file:line evidence, <= 10 lines. If your evidence is inconclusive, reply CONFIRMED. Do not write files or spawn agents.

Written rules outrank observed precedent. Follow convention where no rule speaks; follow the rule where one does ([system dependency checks](references/dependencies.md)). A conflict between convention and rule is a report finding, not a refutation.

Skip skepticism only when there are no hard-gate findings or `Agent` is unavailable. Report findings unchanged; never soften due to unavailable or inconclusive verification.

### `code-reviewer` — vendor couriers (cross-model pass)

Each vendor `run` uses one read-only `Explore` courier named `codex-review` or `agy-review`, per [cross-model review](references/cross-model-review.md). Couriers return stdout, write and spawn nothing, and count toward the 4-helpers-in-flight cap. The vendor process follows that reference's pinned argv, env allowlist, post-pass tree check, and inline fallback.

The exact errand prompt, verbatim return contract, and inline fallback live in the vendor-courier block of [cross-model review](references/cross-model-review.md). Each vendor `run` gets one `Explore` courier named for its CLI (`codex-review`, `agy-review`). The courier runs the pinned command and returns stdout; it writes and spawns nothing. Vendor processes follow the cross-model reference's bounds. Couriers count toward the 4-helper cap.

Vendor couriers do not receive or Read the prose files. Return vendor stdout
verbatim without applying either prose method.

### `implementer` — read-only scouts

Spawn a built-in `Explore` or `team:file-finder` scout when a slice touches a subsystem the plan does not explain and direct mapping would require reading more than ~3 files you will not edit.

- At most 2 scouts in flight. Each returns <= 40 lines of `file:line` findings and spawns nothing.
- Include the four prose paths and ordered audit in every initial and follow-up
  prompt.
- Run scouts in the background: dispatch for the next unfamiliar slice while completing the current slice, then collect it when that slice starts.
- Scouts never write, edit, commit, implement a slice, or run the fix loop.
