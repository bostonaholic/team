---
name: reviewing-designs
description: 'Defines adversarial design review and verdicts. Load when a fresh-context reviewer evaluates `6-design.md`.'
user-invocable: false
---

# Reviewing Designs

## Review brief

Pass this section to a fresh, read-only `Explore` subagent. Substitute the
artifact directory `docs/plans/<id>/` for `$ARGUMENTS`. The reviewer must first
read [references/review-brief.md](references/review-brief.md) completely; it
owns the full criteria, exceptions, and output rules.

Review `$ARGUMENTS/6-design.md` with no author conversation. Use only Read,
Grep, and Glob. Never edit files or run state-changing commands.

Call the Skill tool with `technical-design-doc`, `reviewing-code`,
`engineering-standards`, and `documenting-decisions`. Call the Skill tool with
`cross-model-review` only when the prompt carries an `## External review input`
section. Call the Skill tool with `conventional-comments` for findings and
`writing-prose` for STE-flavored prose and Self-lint.

### Review process

1. **Locate the document.** Read `6-design.md` and present siblings
   `1-task.md`, `2-questions.md`, `4-repos.md`, and `5-research.md`.
2. **Evaluate structure.** Check the applicable `technical-design-doc` or
   `design-author` template: current/desired state, patterns, decisions, scope,
   edge cases, open questions, trade-offs, and rollout.
3. **Audit the decisions.** For each decision, require a real alternative,
   rejected cost, chosen risk, reconstructable reason, and blast radius across
   callers, siblings, and co-changing surfaces.
4. **Verify edge-case enumeration.** Require boundary values, invalid inputs,
   failure paths, concurrency, authorization, and resource limits. Deferred
   cases belong in Out of scope or Non-Goals.
5. **Check every rule reaches every surface it must.** For multiple entry modes,
   standalone sections, or process boundaries, check each safeguard separately.
   A rule present on one surface and not another without a stated reason is
   blocking. Read each claimed self-contained section alone.
6. **Check specificity.** Require concrete `file:line` citations and spot-check
   claims. Missing, false, or unverifiable citations are blocking.
7. **Apply engineering standards.** Check Hickey, Carmack, Armstrong, Knuth,
   Liskov, and Ousterhout; prioritize isolation and contract failures.
8. **Check scope discipline.** Silent subsystem or multi-repo expansion is
   blocking.

### Output format

Use Conventional Comments for every finding with a `file:line`. When external
input exists, emit one paraphrase-only `### Cross-model disposition` that
classifies every claim or skip per `cross-model-review`.

End with exactly one terminal verdict line; nothing follows:

- **APPROVE** — complete structure, justified alternatives, enumerated edge
  cases, accurate citations, and no blocking issue.
- **REQUEST CHANGES** — any required section, decision basis, edge case,
  citation, scope boundary, or cross-surface rule is blocking.
- **COMMENT** — only non-blocking suggestions or nitpicks.

### Brief rules

- Do not rewrite or edit the design. The producer owns it.
- Do not invent intent. Ambiguity is a finding.
- Cite the exact decision and failed criterion.
- Review design, not implementation correctness.
- Remain read-only.
