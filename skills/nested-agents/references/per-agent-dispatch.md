Before each `team:file-finder` dispatch or follow-up, read [host dispatch](../team/references/15-host-dispatch.md).

# Per-agent nested dispatch

Read the shared invariants in [shared guardrails](SKILL.md) first. This file is mandatory before the relevant agent dispatches helpers.

## Prose procedure for non-vendor helpers

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

## `researcher` — exploration scouts

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

## `code-reviewer` and `security-reviewer` — skeptic passes

A hard gate is Blocking-tier `issue:` for code review or CRITICAL/HIGH for security. Before reporting one, send it to a fresh `general-purpose` skeptic: one per finding, at most 4 in flight; batch overflow into one dispatch.

- Include the four prose paths and ordered audit in every skeptic prompt.
  Preserve `REFUTED` or `CONFIRMED`, `file:line` evidence, and the <= 10 lines
  cap.

Use this template for code or exploitability claims:

> Read <file> around line <n>. Claim: "<one-sentence falsifiable statement, e.g. `user` may be null on the early-return path. Or, for a security finding, user input from the `q` parameter reaches this SQL string without parameterization>". Attempt to REFUTE this claim with concrete evidence (guards, callers, sanitization, validation layers, type definitions, tests). Reply REFUTED or CONFIRMED with file:line evidence, <= 10 lines. If your evidence is inconclusive, reply CONFIRMED. Do not write files or spawn agents.

For rule violations, name the rule but omit verdict and severity:

> Read <file> around line <n>. Claim: "<what is there> violates <rule>, stated in `skills/<skill>/SKILL.md`". Read that rule, then attempt to REFUTE the claim: does the rule say what the claim says, and does this code fall outside it through an allowed case declared by the rule or because the rule does not reach this case? Reply REFUTED or CONFIRMED with file:line evidence, <= 10 lines. If your evidence is inconclusive, reply CONFIRMED. Do not write files or spawn agents.

Written rules outrank observed precedent. Follow convention where no rule speaks; follow the rule where one does ([system dependency checks](../../team/references/dependencies.md)). A conflict between convention and rule is a report finding, not a refutation.

Skip skepticism only when there are no hard-gate findings or `Agent` is unavailable. Report findings unchanged; never soften due to unavailable or inconclusive verification.

## `code-reviewer` — vendor couriers

The exact errand prompt, verbatim return contract, and inline fallback live in the vendor-courier block of `skills/cross-model-review/SKILL.md`. Each vendor `run` gets one `Explore` courier named for its CLI (`codex-review`, `agy-review`). The courier runs the pinned command and returns stdout; it writes and spawns nothing. Vendor processes follow the cross-model skill's bounds. Couriers count toward the 4-helper cap.

Vendor couriers do not receive or Read the prose files. Return vendor stdout
verbatim without applying either prose method.

## `implementer` — read-only scouts

Spawn a built-in `Explore` or `team:file-finder` scout when a slice touches a subsystem the plan does not explain and direct mapping would require reading more than ~3 files you will not edit.

- At most 2 scouts in flight. Each returns <= 40 lines of `file:line` findings and spawns nothing.
- Include the four prose paths and ordered audit in every initial and follow-up
  prompt.
- Run scouts in the background: dispatch for the next unfamiliar slice while completing the current slice, then collect it when that slice starts.
- Scouts never write, edit, commit, implement a slice, or run the fix loop.
