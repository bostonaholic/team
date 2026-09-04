---
name: eng-design-doc-review
description: Adversarially review a technical design document with fresh context. Dispatches the built-in read-only `Explore` subagent (clean context, no shared history with the design-author) against `docs/plans/<id>/6-design.md` and presents its verdict — APPROVE, REQUEST CHANGES, or COMMENT. It is the front door over the `reviewing-designs` brief the pipeline's DESIGN review gate also runs. Trigger on "review the design doc", "audit 6-design.md", "is this design ready", or `/eng-design-doc-review`.
effort: high
argument-hint: "[docs/plans/<id>/]"
---

# Engineering Design Doc Review — Independent Fresh-Context Audit

Adversarially review a design document with fresh context. The brief this
skill dispatches lives in `skills/reviewing-designs/SKILL.md`, and the
orchestrator loads the same brief for the DESIGN phase's adversarial
review gate. Invoking this skill standalone remains supported whenever
you want an independent, fresh-context audit of a design document.

Write the prose this skill governs at a seventh-grade reading level, in
STE-flavored mode — short sentences, common words, no unexplained jargon.
Full methodology: `writing-prose`. Before
you finalize prose this skill governs, call the Skill tool with
`writing-prose` and apply its `## Self-lint` checklist.

There is **no custom review agent**. This skill loads the review brief
from `reviewing-designs` and dispatches the built-in read-only
`Explore` subagent through the `Agent` tool. That subagent boots with a
**clean context** and no shared conversation history with the design-author
— that isolation is the whole point. It prevents self-evaluation bias.
`Explore` holds no Write/Edit tools, so the reviewer structurally cannot
change the artifacts it judges.
Fresh context plus veto-without-authorship is the generator-evaluator rule (`skills/principle-generator-evaluator/SKILL.md`).

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery block below resolves it.

The review reads:

- `$ARGUMENTS/6-design.md` — the document under review (required)
- `$ARGUMENTS/1-task.md`, `$ARGUMENTS/2-questions.md`,
  `$ARGUMENTS/5-research.md`, `$ARGUMENTS/4-repos.md` — predecessor artifacts
  (read for grounding when present, missing siblings are not a hard error)

Resolve the artifact directory by running this self-contained block (one bash
call — agent threads reset cwd between calls):

```sh
# Three-tier artifact-directory discovery (archetype A).
# ID_RE + PHASE_FILES canonical from hooks/session-start-recover.mjs.
# PHASE_FILES recency mirrors findActiveTopic() in session-start-recover.mjs.
# NOTE: this block is duplicated across 8 skills by design (see docs/architecture.md); future: shared discover-topic.sh.
ID_RE='^([A-Za-z][A-Za-z0-9_]*-[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2})-[a-z0-9][a-z0-9-]*$'
PHASE_FILES="1-task 2-questions 5-research 6-design 7-structure 8-plan"
PRED="6-design.md"            # predecessor artifact this skill consumes
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
- **If the block printed nothing** (tier 3 — no directory holds `6-design.md`),
  do not hard-error. Fire `AskUserQuestion` with a `Setup` header and labeled
  options:
  - **Run the producer** — run `/team-design docs/plans/<id>/` to produce the
    missing `6-design.md`.
  - **Give a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).

## Execution

> Follow `skills/principle-progress-tracking/SKILL.md`: when this procedure has two or more steps, seed one todo item per step before starting and mark each complete as you go.

1. Use the directory resolved in `## Input`.
2. **Run the external cross-model pass.** Call the Skill tool with
   `cross-model-review` and follow
   its `## Design-review pass` —
   reference that procedure, never duplicate it here. You, the invoking
   session, are the actor: you hold Bash for the runner
   (`external-review.mjs`, resolved per that section) and the `Agent`
   tool for the dispatch — each vendor `run` goes through its own named
   courier sub-agent per that skill's vendor-courier block, with its
   inline fallback. Fence each CLI's raw output as a `DATA` block
   at capture time (fence longer than any backtick run in the output,
   per that section) and hold one `## External review input` section —
   opening with the untrusted-content line that section specifies —
   carrying those blocks, for step 3 to append to the brief it dispatches. Any
   skip continues with the reviewer alone. **No artifact is written** on
   this surface: a standalone run records nothing — no notes append, no raw
   file — and the raw vendor text stays in the invoking session. Name
   any unavailable CLI to the user per that skill's `## When a vendor
   CLI is unavailable`. Edge cases ride the shared section: an
   unauthenticated CLI exits non-zero and reads as an ordinary skip.
3. **Dispatch the review.** Call the Skill tool with `reviewing-designs`
   to read its `## Review brief`. Then call the `Agent` tool with
   `subagent_type: Explore` and `model: opus` — pinning the model keeps a
   cheaper machine-wide subagent default from silently weakening this
   gate — and pass that brief to the `Explore` subagent as the prompt,
   with the artifact directory substituted for `$ARGUMENTS`. Do **not**
   define or reference a project agent — the built-in read-only type is
   the whole mechanism. Its clean context is what makes the review
   independent, and its lack of Write/Edit tools keeps the reviewer
   structurally unable to touch the artifacts. If the environment lacks
   the `Explore` agent type, report the dispatch failure — never
   substitute a full-tool agent silently.
4. **Present the verdict in full.** The subagent returns Conventional
   Comments findings (issue / suggestion / nitpick, each with a
   `file:line` reference) followed by one of APPROVE, REQUEST CHANGES, or
   COMMENT. Relay it verbatim — the subagent's output is not shown to the
   user directly.
5. **Do not auto-revise.** This skill does not loop the design-author. On
   REQUEST CHANGES, surface the findings and let the user decide if to
   re-enter `/team-design` with that feedback.

## Rules

- The brief lives in `skills/reviewing-designs/SKILL.md`, and changing it
  is a pipeline change — that file states the rule.
- This skill is **read-only, structurally for writes**. The `Explore`
  subagent holds no Write/Edit tools, so it cannot change `6-design.md`, the
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
  The toolset, not the prose, is the guarantee for writes (`skills/principle-least-privilege/SKILL.md`).
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
**"To advance, run `/team-design docs/plans/<id>/` — with `6-design.md`
already present it skips drafting and runs the review gate (skipping
even that when the latest recorded verdict already passes — no
redundant re-review), recording
the verdict artifact — then proceed to `/team-structure`."**
If the verdict is REQUEST CHANGES, tell the user:
**"Re-run `/team-design docs/plans/<id>/` with the findings above to
re-dispatch `design-author` for a revision."**
