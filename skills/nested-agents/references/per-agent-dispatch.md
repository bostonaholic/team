# Per-agent nested dispatch

Read the shared invariants in `../SKILL.md` first. This file is mandatory before the relevant agent dispatches helpers.

## `researcher` — exploration scouts

Fan out read-only exploration when questions cluster into independent areas or `4-repos.md` lists multiple repos.

- Scout types: `team:file-finder` or built-in `Explore`; nothing else.
- The isolation invariant extends downward. Prompts and follow-ups may contain ONLY question text copied verbatim from `2-questions.md`, its `Codebase context`, and repo slugs/paths from `4-repos.md`. Never add framing, mention `1-task.md`, or speculate about intent.
- Spawn only when a cluster requires more reading than the report will quote. Handle one or two pointed questions directly.
- At most 4 scouts, preferably parallel. Each returns <= 30 lines of `file:line` findings and spawns nothing. Combined output must fit the researcher's 100-line report budget.

## `code-reviewer` and `security-reviewer` — skeptic passes

A hard gate is Blocking-tier `issue:` for code review or CRITICAL/HIGH for security. Before reporting one, send it to a fresh `general-purpose` skeptic: one per finding, at most 4 in flight; batch overflow into one dispatch.

Use this template for code or exploitability claims:

> Read <file> around line <n>. Claim: "<one-sentence falsifiable statement, e.g. `user` may be null on the early-return path. Or, for a security finding, user input from the `q` parameter reaches this SQL string without parameterization>". Attempt to REFUTE this claim with concrete evidence (guards, callers, sanitization, validation layers, type definitions, tests). Reply REFUTED or CONFIRMED with file:line evidence, <= 10 lines. If your evidence is inconclusive, reply CONFIRMED. Do not write files or spawn agents.

For rule violations, name the rule but omit verdict and severity:

> Read <file> around line <n>. Claim: "<what is there> violates <rule>, stated in `skills/<skill>/SKILL.md`". Read that rule, then attempt to REFUTE the claim: does the rule say what the claim says, and does this code fall outside it through an allowed case declared by the rule or because the rule does not reach this case? Reply REFUTED or CONFIRMED with file:line evidence, <= 10 lines. If your evidence is inconclusive, reply CONFIRMED. Do not write files or spawn agents.

Written rules outrank observed precedent. Follow convention where no rule speaks; follow the rule where one does (`skills/systems-thinking/SKILL.md`). A conflict between convention and rule is a report finding, not a refutation.

Skip skepticism only when there are no hard-gate findings or `Agent` is unavailable. Report findings unchanged; never soften due to unavailable or inconclusive verification.

## `code-reviewer` — vendor couriers

The exact errand prompt, verbatim return contract, and inline fallback live in the vendor-courier block of `skills/cross-model-review/SKILL.md`. Each vendor `run` gets one `Explore` courier named for its CLI (`codex-review`, `agy-review`). The courier runs the pinned command and returns stdout; it writes and spawns nothing. Vendor processes follow the cross-model skill's bounds. Couriers count toward the 4-helper cap.

## `implementer` — read-only scouts

Spawn a built-in `Explore` or `team:file-finder` scout when a slice touches a subsystem the plan does not explain and direct mapping would require reading more than ~3 files you will not edit.

- At most 2 scouts in flight. Each returns <= 30 lines of `file:line` findings and spawns nothing.
- Run scouts in the background: dispatch for the next unfamiliar slice while completing the current slice, then collect it when that slice starts.
- Scouts never write, edit, commit, implement a slice, or run the fix loop.
