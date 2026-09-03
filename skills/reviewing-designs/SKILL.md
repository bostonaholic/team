---
name: reviewing-designs
description: Adversarially review 6-design.md with fresh, read-only context and return Team's design verdict.
user-invocable: false
---

# Reviewing Designs

This is the shared DESIGN review brief used by internal `team-design` and
standalone `eng-design-doc-review`.

## Review brief

Pass this section to a read-only `Explore` subagent. Replace `$ARGUMENTS` with
the `docs/plans/<id>/` artifact directory.

Review `$ARGUMENTS/6-design.md` with fresh context. Use only Read, Grep, and
Glob. Do not edit files or infer intent not stated in the artifacts.

Before reviewing, call the Skill tool with `technical-design-doc`,
`reviewing-code`, `engineering-standards`, and `documenting-decisions`. When
the prompt contains `## External review input`, also load
`cross-model-review`. Load `conventional-comments` before writing findings.

### Review process

Follow `skills/principle-progress-tracking/SKILL.md`: seed one todo per step
and update each as you work.

1. **Locate the document.** Read `6-design.md` and any sibling `1-task.md`,
   `2-questions.md`, `5-research.md`, and `4-repos.md`.

2. **Evaluate required structure.** Check every section required by
   `technical-design-doc`. For a pipeline `6-design.md`, use the design-author
   template instead: Current state, Desired end state, Patterns to follow,
   Decisions made, Out of scope, Edge cases, Open questions (deferred), Risks.

3. **Audit the decisions.** For each decision, require a named alternative,
   the cost accepted, enough context to reconstruct why, and its blast radius:
   callers, siblings, and surfaces that change together.

4. **Verify edge-case enumeration.** Require boundary values, invalid input,
   failure paths, concurrency, authorization, and resource limits. Deferred
   cases belong in Out of scope or Non-Goals.

5. **Check every rule reaches every surface it must.** Skip only for a design
   with one input surface. Otherwise map each new rule or safeguard across all
   entry modes and self-contained paths. Read each self-contained path alone.
   A reasoned omission is a decision; silence is a finding.

6. **Check specificity and evidence.** Prefer `file:line` references. Verify a
   sample. A missing or false citation is blocking.

7. **Apply engineering standards.** Check simplicity, failure isolation,
   readable design, interface contracts, and deep modules. Contract and
   failure-isolation defects rank above style.

8. **Check scope.** Stay within repos and subsystems established by predecessor
   artifacts. Silent multi-repo expansion is blocking.

### Output format

Write every finding as a Conventional Comment with `file:line`. Apply
`skills/writing-prose/SKILL.md` and its `## Self-lint` checklist.

If external input was present, include one `### Cross-model disposition`
block per `cross-model-review`: paraphrase-only; classify every claim as
verified, refuted, or unverifiable; record skips.

The terminal line is exactly one verdict:

- **APPROVE** — all required sections, justified decisions, enumerated edge
  cases, accurate citations, and no blocking issue.
- **REQUEST CHANGES** — any blocking issue: missing necessary section,
  unjustified decision, absent edge cases, false/unverifiable citation, silent
  scope expansion, or a rule that reaches one surface and not another without
  a stated reason.
- **COMMENT** — non-blocking findings only.

Do not rewrite the document, fix findings, ask the author, review source-code
correctness, or run state-changing commands. Ambiguity is itself a finding.
