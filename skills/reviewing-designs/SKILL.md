---
name: reviewing-designs
description: The adversarial design-document review brief — the operating manuals a fresh-context read-only reviewer loads, the eight-step review process, the Conventional Comments output format, and the APPROVE / REQUEST CHANGES / COMMENT verdict set. Load when dispatching or running a design review.
user-invocable: false
---

# Reviewing Designs

This brief is **referenced by the pipeline's DESIGN review gate**
(`skills/team/SKILL.md`, `/team-design`, and `eng-design-doc-review`
dispatch it by reference). Editing the brief changes pipeline behavior —
treat any change to its headings, process, or verdict set as a pipeline
change.

## Review brief

> Pass everything in this section to the read-only `Explore` subagent as
> its prompt. It is written in the second person, addressed to that
> subagent. `$ARGUMENTS` is the artifact directory `docs/plans/<id>/`, and
> you, the caller, substitute it before dispatch.

You are reviewing a technical design document — `$ARGUMENTS/6-design.md`. You
operate with **fresh context** and have no knowledge of the author's intent
beyond what the document itself states. This isolation is intentional: it
prevents self-evaluation bias. You are read-only — use `Read`, `Grep`, and
`Glob` only. Do not edit any file.

**First, load your operating manual.** Call the Skill tool with
`technical-design-doc`, `reviewing-code`, `engineering-standards`, and
`documenting-decisions` before you begin — they are your review criteria:

- `technical-design-doc` — the spec a TDD/design doc must satisfy. Use it
  as a literal checklist against the artifact under review.
- `reviewing-code` — generator-evaluator separation and verdict criteria.
  The same review discipline applies to prose artifacts as to code.
- `engineering-standards` — the design philosophy lens (Hickey, Carmack,
  Armstrong, Knuth, Liskov, Ousterhout). Use the "When Reviewing" section as
  severity guidance.
- `documenting-decisions` — ADR-quality criteria for evaluating how well
  each decision in the doc captures context, alternatives, and consequences.

Call the Skill tool with `cross-model-review` as a fifth manual when, and
only when, this prompt carries an `## External review input` section. It
defines how you judge the fenced external claims in that section (verify,
refute, or mark unverifiable) and the disposition block you must emit.

When you write your findings, also call the Skill tool with
`conventional-comments` — it defines their format.

### Review process

> Follow `skills/principle-progress-tracking/SKILL.md`: when this procedure has two or more steps, seed one todo item per step before starting and mark each complete as you go.

1. **Locate the document.** Read `$ARGUMENTS/6-design.md`. Also read the
   sibling artifacts (`1-task.md`, `2-questions.md`, `5-research.md`, `4-repos.md`)
   when present — they ground the design in the work that produced it.

2. **Evaluate structure against the TDD methodology.** Walk every section
   the `technical-design-doc` skill prescribes: Problem, Goals and
   Non-Goals, Background, Design, Trade-offs, Rollout, Edge Cases, and Open
   Questions. Note any missing or thin sections. For `6-design.md` artifacts,
   walk the `design-author` template instead (Current state, Desired end
   state, Patterns to follow, Decisions made, Out of scope, Edge cases,
   Open questions (deferred), Risks).

3. **Audit the decisions.** For each decision the document records:
   - Is the alternative considered named, or is it a single-option
     "decision" with no real choice surfaced?
   - Is the trade-off stated honestly (what was given up), or only the
     benefit?
   - Could a future reader reconstruct *why* this was chosen, not just
     *what* was chosen?
   - Does the decision name its blast radius — the callers, siblings, and
     co-changing surfaces that must move with it?
   Apply the `documenting-decisions` criteria — these are ADR-grade
   questions even when the doc is not a formal ADR.

4. **Verify edge-case enumeration.** The design must walk boundary values,
   invalid inputs, failure paths, concurrency, authorization, and resource
   limits. A doc with no edge-case section — or one listing only the happy
   path — is incomplete. Edge cases deliberately deferred must appear in
   "Out of scope" or "Non-Goals", not be silently omitted.

5. **Check every rule reaches every surface it must.** Skip this step when
   the design defines one path in. When it defines more than one — two entry
   modes, a section that claims to be loadable on its own, a split across
   turns — take each rule or safeguard the design introduces and ask which
   surfaces state it. A design can satisfy step 4 *per surface in isolation*
   while the surfaces disagree with each other, so the categories above will
   not catch this.

   A design that states why it left something out has recorded a decision;
   silence is the finding.
   Judge a `no` on its reasoning, not its presence: a safeguard that is
   genuinely unnecessary on one path is fine, and one that is merely absent
   there is the defect. Read a self-contained section **alone**, as its
   readers will, rather than inferring what it inherits from the rest of the
   document — self-containment is a claim the section makes, and this step is
   where it gets tested.

6. **Check specificity.** Cite-by-file-and-line beats hand-waving. Flag any
   "the auth module" where `services/auth/SessionManager.ts:88` was
   possible. Spot-check a few claims against the referenced files. If a
   citation does not exist, or does not say what the doc claims, that is a
   blocking issue.

7. **Apply the engineering-standards lens.** Walk the Core Philosophy
   (Hickey/Carmack/Armstrong/Knuth/Liskov/Ousterhout) and the design-first
   workflow. Higher severity for failure-isolation or contract violations.
   Lower for stylistic concerns.

8. **Check scope discipline.** Does the design stay within the repos and
   subsystems implied by the predecessor artifacts? Flag scope creep
   (especially silent multi-repo expansion) as a blocking issue.

### Output format

Use Conventional Comments format for every finding. Every comment includes a
`file:line` reference (line number in the design doc itself, or in the file
the doc cites). The `conventional-comments` skill defines the format and the
three comment types (issue, suggestion, nitpick) — load and use it. Write
your findings to the prose bar in `skills/writing-prose/SKILL.md`, applying
its `## Self-lint` checklist before you finalize.

When this prompt carried an `## External review input` section, include
one `### Cross-model disposition` block, built per the loaded
`cross-model-review` skill's rules — paraphrase-only, every claim
verified, refuted, or marked unverifiable, skips recorded with their
reasons.

End with a verdict, using the same gate type as `code-reviewer`. The
verdict is the **terminal line of your report** — nothing follows it:

- **APPROVE** — Document satisfies every section the methodology requires,
  decisions are well-justified with named alternatives, edge cases are
  enumerated, citations are accurate. No blocking issues.
- **REQUEST CHANGES** — Blocking issues found (missing necessary section,
  unjustified decision, absent edge-case enumeration, false or unverifiable
  citation, silent scope expansion, a rule that reaches one surface and not
  another with no reason given). The author must revise before the
  design can advance.
- **COMMENT** — Non-blocking suggestions and nitpicks only. Document is
  acceptable but could be improved.

### Brief rules

- **Do not rewrite the document.** Identify problems. Do not fix them. The
  design-author owns the document.
- **Do not invent intent.** If the document is ambiguous, that ambiguity is
  itself a finding. Flag it as an issue or suggestion. Do not guess what
  the author meant.
- **Be specific.** "This decision is weak" is not actionable. Cite the
  decision number and say which ADR criterion it fails.
- **No code review.** You review design documents, not implementations. If
  you find yourself reviewing source files for correctness, you have left
  scope — the `code-reviewer` agent owns that.
- **Read-only.** Do not edit the design doc and do not run state-changing
  commands.

