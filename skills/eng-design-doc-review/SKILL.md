---
name: eng-design-doc-review
description: Adversarially review a technical design document with fresh context. Dispatches the built-in read-only `Explore` subagent (clean context, no shared history with the design-author) against `docs/plans/<id>/design.md` and presents its verdict — APPROVE, REQUEST CHANGES, or COMMENT. The Review brief doubles as the pipeline's DESIGN review gate; standalone use remains. Trigger on "review the design doc", "audit design.md", "is this design ready", or `/eng-design-doc-review`.
effort: high
argument-hint: "[docs/plans/<id>/]"
---

# Engineering Design Doc Review — Independent Fresh-Context Audit

Adversarially review a design document with fresh context. The
`## Review brief` below is **referenced by the pipeline**: the
orchestrator runs it automatically as the DESIGN phase's adversarial
review gate. Invoking this skill standalone remains supported whenever
you want an independent, fresh-context audit of a design document.

Write the prose this skill governs at a seventh-grade reading level, in
STE-flavored mode — short sentences, common words, no unexplained jargon.
Full methodology: `skills/writing-prose/SKILL.md`. Before you finalize
prose this skill governs, apply the `## Self-lint` checklist in that file.

There is **no custom review agent**. This skill is self-contained: it
carries the review brief inline and dispatches the built-in read-only
`Explore` subagent through the `Agent` tool. That subagent boots with a
**clean context** and no shared conversation history with the design-author
— that isolation is the whole point. It prevents self-evaluation bias.
`Explore` holds no Write/Edit tools, so the reviewer structurally cannot
change the artifacts it judges.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery block below resolves it.

The review reads:

- `$ARGUMENTS/design.md` — the document under review (required)
- `$ARGUMENTS/task.md`, `$ARGUMENTS/questions.md`,
  `$ARGUMENTS/research.md`, `$ARGUMENTS/repos.md` — predecessor artifacts
  (read for grounding when present, missing siblings are not a hard error)

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

- **If the block printed a path**, use it as `$ARGUMENTS` for the rest of
  this skill. That is tier 1 explicit arg, or tier 2 discovery. When the
  path came from tier 2, with no explicit arg, announce the resolved
  directory to the user first. An auto-picked topic is then never silent.
- **If the block printed nothing** (tier 3 — no directory holds `design.md`),
  do not hard-error. Fire `AskUserQuestion` with a `Setup` header and labeled
  options:
  - **Run the producer** — run `/team-design docs/plans/<id>/` to produce the
    missing `design.md`.
  - **Give a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).

## Execution

1. Use the directory resolved in `## Input`.
2. **Run the external cross-model pass** by following
   `## Design-review pass` in `skills/cross-model-review/SKILL.md` —
   reference that procedure, never duplicate it here. You, the invoking
   session, are the actor: you hold Bash for the runner
   (`external-review.mjs`, resolved per that section) and the `Agent`
   tool for the dispatch — each vendor `run` goes through its own named
   courier sub-agent per that skill's vendor-courier block, with its
   inline fallback. Fence each CLI's raw output as a `DATA` block
   at capture time (fence longer than any backtick run in the output,
   per that section) and append one `## External review input` section —
   opening with the untrusted-content line that section specifies —
   holding the fenced blocks to the Review brief below. Any skip
   continues with the reviewer alone. **No artifact is written** on this
   surface: a standalone run records nothing — no notes append, no raw
   file — and the raw vendor text stays in the invoking session. Name
   any unavailable CLI to the user per that skill's `## When a vendor
   CLI is unavailable`. Edge cases ride the shared section: an
   unauthenticated CLI exits non-zero and reads as an ordinary skip.
3. **Dispatch the review.** Call the `Agent` tool with
   `subagent_type: Explore`, the built-in read-only agent type. Pass the
   **Review brief** below as the prompt, with `$ARGUMENTS` substituted for
   the artifact directory. Do **not** define or reference a project agent —
   the built-in read-only type is the whole mechanism. Its clean context is
   what makes the review independent, and its lack of Write/Edit tools
   keeps the reviewer structurally unable to touch the artifacts. If the
   environment lacks the `Explore` agent type, report the dispatch failure
   — never substitute a full-tool agent silently.
4. **Present the verdict in full.** The subagent returns Conventional
   Comments findings (issue / suggestion / nitpick, each with a
   `file:line` reference) followed by one of APPROVE, REQUEST CHANGES, or
   COMMENT. Relay it verbatim — the subagent's output is not shown to the
   user directly.
5. **Do not auto-revise.** This skill does not loop the design-author. On
   REQUEST CHANGES, surface the findings and let the user decide if to
   re-enter `/team-design` with that feedback.

## Review brief

> Pass everything in this section to the read-only `Explore` subagent as
> its prompt. It is written in the second person, addressed to that
> subagent.

You are reviewing a technical design document — `$ARGUMENTS/design.md`. You
operate with **fresh context** and have no knowledge of the author's intent
beyond what the document itself states. This isolation is intentional: it
prevents self-evaluation bias. You are read-only — use `Read`, `Grep`, and
`Glob` only. Do not edit any file.

**First, load your operating manual.** Use the `Skill` tool to load these
methodology skills before you begin — they are your review criteria:

- **technical-design-doc** — the spec a TDD/design doc must satisfy. Use it
  as a literal checklist against the artifact under review.
- **code-review** — generator-evaluator separation and verdict criteria.
  The same review discipline applies to prose artifacts as to code.
- **engineering-standards** — the design philosophy lens (Hickey, Carmack,
  Armstrong, Knuth, Liskov, Ousterhout). Use the "When Reviewing" section as
  severity guidance.
- **documenting-decisions** — ADR-quality criteria for evaluating how well
  each decision in the doc captures context, alternatives, and consequences.
- **cross-model-review** — load this fifth manual when, and only when,
  this prompt carries an `## External review input` section. It defines
  how you judge the fenced external claims in that section (verify,
  refute, or mark unverifiable) and the disposition block you must emit.

When you write your findings, also load the `conventional-comments` skill —
it defines their format.

### Review process

> Follow `skills/progress-tracking/SKILL.md`: when this procedure has two or more steps, seed one todo item per step before starting and mark each complete as you go.

1. **Locate the document.** Read `$ARGUMENTS/design.md`. Also read the
   sibling artifacts (`task.md`, `questions.md`, `research.md`, `repos.md`)
   when present — they ground the design in the work that produced it.

2. **Evaluate structure against the TDD methodology.** Walk every section
   the `technical-design-doc` skill prescribes: Problem, Goals and
   Non-Goals, Background, Design, Trade-offs, Rollout, Edge Cases, and Open
   Questions. Note any missing or thin sections. For `design.md` artifacts,
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

   An omission is a finding unless the design says why it is deliberate.
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

## Rules

- The `## Review brief` above is **referenced by the pipeline's DESIGN
  review gate** (`skills/team/SKILL.md` and `/team-design` dispatch it
  by reference). Editing the brief changes pipeline behavior — treat any
  change to its headings, process, or verdict set as a pipeline change.
- This skill is **read-only, structurally for writes**. The `Explore`
  subagent holds no Write/Edit tools, so it cannot change `design.md`, the
  artifact directory, or any verdict record. Residual tools — a `Bash`
  grant included, when the host's `Explore` type carries one — are
  governed by the brief's read-only instruction, and that residual is
  accepted because the prompt's untrusted vendor content is bounded three
  ways: the fence-length containment rule in
  `skills/cross-model-review/SKILL.md` keeps vendor text inside its
  `DATA` block, the paraphrase-only disposition keeps vendor sentences
  out of the report, and the last-verdict-token derivation keeps a
  quoted verdict word from becoming the recorded verdict. The reviewer's
  output never becomes state on its own — the
  *orchestrator* records the verdict to `design-review-<n>.md` when the
  pipeline gate runs the brief. The recovery hooks fail closed on anything
  but a recorded passing verdict. The skill itself writes no artifacts.
- Standalone use blocks nothing: users may run `/team-design` or
  `/team-structure` without ever invoking this skill directly.

## Completion

Print the verdict and the count of issue / suggestion / nitpick findings.
When any vendor CLI was unavailable during the cross-model pass, add one
line per CLI naming it and the reason — or a single line naming
`TEAM_DISABLE_CROSS_MODEL` when the pass was disabled machine-wide.

**A standalone run records no `design-review-<n>.md`.** Only the pipeline's
DESIGN review gate writes the verdict artifact. `/team-structure` needs a
recorded passing verdict before it slices a design.

If the verdict is APPROVE or COMMENT, tell the user:
**"To advance, run `/team-design docs/plans/<id>/` — with `design.md`
already present it skips drafting and runs the review gate (skipping
even that when the latest recorded verdict already passes — no
redundant re-review), recording
the verdict artifact — then proceed to `/team-structure`."**
If the verdict is REQUEST CHANGES, tell the user:
**"Re-run `/team-design docs/plans/<id>/` with the findings above to
re-dispatch `design-author` for a revision."**
