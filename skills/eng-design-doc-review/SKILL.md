---
name: eng-design-doc-review
description: Adversarially review a technical design document with fresh context before the human gate. Dispatches the built-in `general-purpose` subagent (clean context, no shared history with the design-author) against `docs/plans/<id>/design.md` and presents its verdict — APPROVE, REQUEST CHANGES, or COMMENT. Optional, not part of the QRSPI pipeline. Trigger on "review the design doc", "audit design.md", "is this design ready", or `/eng-design-doc-review`.
effort: high
argument-hint: "[docs/plans/<id>/]"
---

# Engineering Design Doc Review — Independent Audit Before the Human Gate

Adversarially review a design document with fresh context. This is an
**optional** review step — it is not part of the QRSPI phase table and
adds no gate to the orchestrator. Invoke it when you want an independent,
fresh-context audit before you walk into the DESIGN human gate.

Write the prose this skill governs at a seventh-grade reading
level — short sentences, common words, no unexplained jargon. Full
methodology: `skills/writing-prose/SKILL.md`.

There is **no custom review agent**. This skill is self-contained: it
carries the review brief inline and dispatches the built-in
`general-purpose` subagent via the `Agent` tool. That subagent boots with
a **clean context** and no shared conversation history with the
design-author — that isolation is the whole point. It prevents
self-evaluation bias.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery block below resolves it.

The review reads:

- `$ARGUMENTS/design.md` — the document under review (required)
- `$ARGUMENTS/task.md`, `$ARGUMENTS/questions.md`,
  `$ARGUMENTS/research.md`, `$ARGUMENTS/repos.md` — predecessor artifacts
  (read for grounding when present; missing siblings are not a hard error)

Resolve the artifact directory by running this self-contained block (one bash
call — agent threads reset cwd between calls):

```sh
# Three-tier artifact-directory discovery (archetype A).
# ID_RE + PHASE_FILES canonical from hooks/session-start-recover.mjs.
# PHASE_FILES recency mirrors findActiveTopic() in session-start-recover.mjs.
# NOTE: this block is duplicated across 8 skills by design (see docs/architecture.md); future: shared discover-topic.sh.
ID_RE='^([A-Za-z][A-Za-z0-9_]*-[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2})-[a-z0-9][a-z0-9-]*$'
PHASE_FILES="task questions research design structure plan"
PRED="design.md"            # predecessor artifact this skill consumes
# Tier 1 — explicit: $ARGUMENTS names an existing dir → use verbatim.
if [ -n "$ARGUMENTS" ] && [ -d "$ARGUMENTS" ]; then
  echo "$ARGUMENTS"; exit 0
fi
# Tier 2 — discover: newest ID_RE dir under docs/plans/ that holds PRED.
best=""; best_mtime=-1
# Assumes cwd is the repo/worktree root (where docs/plans/ lives).
for dir in docs/plans/*/; do
  name="$(basename "$dir")"
  printf '%s' "$name" | grep -qE "$ID_RE" || continue   # ID_RE filter
  [ -f "$dir$PRED" ] || continue                        # predecessor filter
  m=-1
  for p in $PHASE_FILES; do
    f="$dir$p.md"
    [ -f "$f" ] || continue                             # skip racing/absent
    s="$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null)" || continue
    [ "${s:-0}" -gt "$m" ] && m="$s"                    # max-mtime over PHASE_FILES
  done
  [ "$m" -gt "$best_mtime" ] && { best_mtime="$m"; best="$dir"; }
done
[ -n "$best" ] && { echo "$best"; exit 0; }
# Tier 3 — none found: print nothing → fall to AskUserQuestion (prose below).
```

- **If the block printed a path**, use it as `$ARGUMENTS` for the rest of this
  skill (tier 1 explicit arg, or tier 2 discovery). When the path came from
  tier 2 (no explicit arg), announce the resolved directory to the user before
  proceeding, so an auto-picked topic is never silent.
- **If the block printed nothing** (tier 3 — no directory holds `design.md`),
  do not hard-error. Fire `AskUserQuestion` with a `Setup` header and labeled
  options:
  - **Run the producer** — run `/team-design docs/plans/<id>/` to produce the
    missing `design.md`.
  - **Provide a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).

## Execution

1. Use the directory resolved in `## Input`.
2. **Dispatch the review.** Call the `Agent` tool with
   `subagent_type: general-purpose` and pass the **Review brief** below as
   the prompt, with `$ARGUMENTS` substituted for the artifact directory. Do
   **not** define or reference a project agent — the built-in
   `general-purpose` type is the whole mechanism. Its clean context is what
   makes the review independent.
3. **Present the verdict in full.** The subagent returns Conventional
   Comments findings (issue / suggestion / nitpick, each with a
   `file:line` reference) followed by one of APPROVE, REQUEST CHANGES, or
   COMMENT. Relay it verbatim — the subagent's output is not shown to the
   user directly.
4. **Do not auto-revise.** This skill does not loop the design-author.
   On REQUEST CHANGES, surface the findings and let the user decide
   whether to re-enter `/team-design` with that feedback.

## Review brief

> Pass everything in this section to the `general-purpose` subagent as its
> prompt. It is written in the second person, addressed to that subagent.

You are reviewing a technical design document — `$ARGUMENTS/design.md`. You
operate with **fresh context** and have no knowledge of the author's intent
beyond what the document itself states. This isolation is intentional: it
prevents self-evaluation bias. You are read-only — use `Read`, `Grep`, and
`Glob` only; do not edit any file.

**First, load your operating manual.** Use the `Skill` tool to load these
four methodology skills before you begin — they are your review criteria:

- **technical-design-doc** — the spec a TDD/design doc must satisfy. Use it
  as a literal checklist against the artifact under review.
- **code-review** — generator-evaluator separation and verdict criteria.
  The same review discipline applies to prose artifacts as to code.
- **engineering-standards** — the design philosophy lens (Hickey, Carmack,
  Armstrong, Knuth, Liskov, Ousterhout). Use the "When Reviewing" section as
  severity guidance.
- **documenting-decisions** — ADR-quality criteria for evaluating how well
  each decision in the doc captures context, alternatives, and consequences.

When you write your findings, also load the `conventional-comments` skill —
it defines their format.

### Review process

> Follow `skills/progress-tracking/SKILL.md`: when this procedure has two or more steps, seed one todo item per step before starting and mark each complete as you go.

1. **Locate the document.** Read `$ARGUMENTS/design.md`. Also read the
   sibling artifacts (`task.md`, `questions.md`, `research.md`, `repos.md`)
   when present — they ground the design in the work that produced it.

2. **Evaluate structure against the TDD methodology.** Walk every section
   the `technical-design-doc` skill prescribes (Problem, Goals/Non-Goals,
   Background, Design, Trade-offs, Rollout, Edge Cases, Open Questions) and
   note any missing or thin sections. For `design.md` artifacts, walk the
   `design-author` template instead (Current state, Desired end state,
   Patterns to follow, Decisions made, Out of scope, Edge cases, Open
   questions, Risks).

3. **Audit the decisions.** For each decision the document records:
   - Is the alternative considered named, or is it a single-option
     "decision" with no real choice surfaced?
   - Is the trade-off stated honestly (what was given up), or only the
     benefit?
   - Could a future reader reconstruct *why* this was chosen, not just
     *what* was chosen?
   Apply the `documenting-decisions` criteria — these are ADR-grade
   questions even when the doc is not a formal ADR.

4. **Verify edge-case enumeration.** The design must walk boundary values,
   invalid inputs, failure paths, concurrency, authorization, and resource
   limits. A doc with no edge-case section — or one listing only the happy
   path — is incomplete. Edge cases deliberately deferred must appear in
   "Out of scope" or "Non-Goals", not be silently omitted.

5. **Check specificity.** Cite-by-file-and-line beats hand-waving. Flag
   any "the auth module" where `services/auth/SessionManager.ts:88` would
   have been possible. Spot-check a few claims by reading the referenced
   files — if a citation does not exist or does not say what the doc
   claims, that is a blocking issue.

6. **Apply the engineering-standards lens.** Walk the Core Philosophy
   (Hickey/Carmack/Armstrong/Knuth/Liskov/Ousterhout) and the design-first
   workflow. Higher severity for failure-isolation or contract violations;
   lower for stylistic concerns.

7. **Check scope discipline.** Does the design stay within the repos and
   subsystems implied by the predecessor artifacts? Flag scope creep
   (especially silent multi-repo expansion) as a blocking issue.

### Output format

Use Conventional Comments format for every finding. Every comment includes a
`file:line` reference (line number in the design doc itself, or in the file
the doc cites). The `conventional-comments` skill defines the format and the
three comment types (issue, suggestion, nitpick) — load and use it.

Write the prose your report carries at a seventh-grade reading
level — short sentences, common words, no unexplained jargon. Full
methodology: `skills/writing-prose/SKILL.md`.

End with a verdict, using the same gate type as `code-reviewer`:

- **APPROVE** — Document satisfies every section the methodology requires,
  decisions are well-justified with named alternatives, edge cases are
  enumerated, citations are accurate. No blocking issues.
- **REQUEST CHANGES** — Blocking issues found (missing required section,
  unjustified decision, absent edge-case enumeration, false or unverifiable
  citation, silent scope expansion). The author must revise before the
  human gate.
- **COMMENT** — Non-blocking suggestions and nitpicks only. Document is
  acceptable but could be improved.

### Brief rules

- **Do not rewrite the document.** Identify problems; do not fix them. The
  design-author owns the document.
- **Do not invent intent.** If the document is ambiguous, that ambiguity is
  itself a finding — flag it as an issue or suggestion, do not guess what
  the author meant.
- **Be specific.** "This decision is weak" is not actionable. Cite the
  decision number and say which ADR criterion it fails.
- **No code review.** You review design documents, not implementations. If
  you find yourself reviewing source files for correctness, you have left
  scope — the `code-reviewer` agent owns that.
- **Read-only.** Do not edit the design doc and do not run state-changing
  commands.

## Rules

- This skill is **read-only**. It dispatches a read-only review and
  produces a report; it does not modify `design.md` or the artifact
  directory.
- The skill does NOT touch the `approved` / `approved_at` frontmatter
  on `design.md`. The human gate in `/team-design` is the only thing
  that flips those fields. An APPROVE verdict from this skill is an
  advisory signal, not a pipeline gate.
- The skill does NOT block `/team-design` or `/team-structure`. Users
  may run those without ever invoking this skill.

## Completion

Print the verdict and the count of issue / suggestion / nitpick findings.
If the verdict is APPROVE or COMMENT, tell the user:
**"You can proceed to the `/team-design` human gate."**
If the verdict is REQUEST CHANGES, tell the user:
**"Re-run `/team-design docs/plans/<id>/` with the findings above to
re-dispatch `design-author` for a revision."**
