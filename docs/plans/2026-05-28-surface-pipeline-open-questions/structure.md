---
topic: surface-pipeline-open-questions
date: 2026-05-28
phase: structure
approved: true
approved_at: 2026-05-29T03:27:33Z
revision: 1
---

# Structure: surface-pipeline-open-questions

## Slices

Six slices, ordered so the contract (the new skill) lands first, then the
orchestrator learns to parse it, then the two agents migrate onto it, then
the cross-link and metadata catch up. This is a documentation/prompt
change — "tests" are prose checks (grep, frontmatter presence, hook
validation) plus the project's existing dev hooks. The end-to-end
verification is at the bottom (acceptance signals).

### Slice 1: Author the shared protocol skill
**Goal:** Land the single source of truth for the envelope + resume
contract so subsequent slices can reference it by path.
**Layers touched:** new methodology skill file.
**Files touched:**
- `skills/agent-open-questions/SKILL.md` (new) — YAML frontmatter
  (`name`, `description`); body sections: envelope shape (fenced
  ```` ```json ```` block with top-level `openQuestions` array, items
  mirroring `AskUserQuestion`: `question`, `header`, `options[{label,
  description}]`); the **"do not call `AskUserQuestion` from inside a
  subagent"** rule; the orchestrator parse rule (Decision 5 — first
  fenced `json` block with an `openQuestions` array wins); the
  resume-via-`SendMessage(to: agentId, message: <user selections
  verbatim>)` contract; size caps (≤ 4 questions per envelope, ≤ ~200
  chars per `description`); revision-dispatch exception (envelope
  optional on revisions); the parallel-dispatch limitation note; a
  short note that `AskUserQuestion` returns only the chosen `label`
  (no free-text), so when a subagent needs free-text input it should
  state in the option's `description` that the orchestrator will
  follow up with a plain-text question post-render (the escape-hatch
  pattern formalized in slice 2).
**Tests / verification checkpoint:**
1. File exists at `skills/agent-open-questions/SKILL.md`.
2. The runtime `hooks/post-write-validate.mjs` SKILL.md check passes
   (file starts with `---` frontmatter) — confirmed automatically by
   the hook on save.
3. Grep `openQuestions` and `SendMessage` both find at least one hit
   in the file.
4. Manual read: every Decision 1–5 and the edge-case rules
   (zero-question, 4-question cap, malformed JSON two-attempt path,
   envelope + summary collision) are stated, and the free-text
   escape-hatch note is present.
**Atomic commit message:** `feat(skills): add agent-open-questions
protocol skill`
**Rollback:** delete the new file.

### Slice 2: Teach the orchestrator to parse the envelope and resume
**Goal:** The orchestrator's documented phase loop describes the
parse → render → `SendMessage` sequence so the model executes it on
every dispatch. This is the slice that makes the protocol live.
**Layers touched:** orchestrator skill prose (phase loop + canonical-
tool passage).
**Files touched:**
- `skills/team/SKILL.md` (edit):
  - **Phase-loop insertion (around lines 64–66)** — between current
    step 4 "Dispatch" and step 5 "Write each returned artifact",
    insert a new step that: (a) scans the Task tool's returned
    final-message text for fenced ```` ```json ```` blocks;
    (b) if the first such block carries an `openQuestions` array,
    calls `AskUserQuestion` with that array verbatim;
    (c) if any chosen option's `description` declares that the
    orchestrator must follow up with free-text input (or the
    subagent's prompt explicitly requires it for that branch),
    the orchestrator asks a plain-text follow-up question and
    incorporates the user's response into the resume message —
    this is the **free-text escape hatch** because
    `AskUserQuestion` returns only labels;
    (d) resumes the same subagent via `SendMessage(to: <agentId>,
    message: <user selections verbatim, plus any free-text follow-up
    response>)`;
    (e) on malformed JSON, follows the two-attempt path → on second
    failure writes `dispatch-failure.md` with frontmatter
    `phase: <current>, status: parse-failed` and halts the phase in
    TodoWrite. Cross-link `skills/agent-open-questions/SKILL.md` as
    the canonical description. Reference Decision 5
    (first-block-wins) by name so future edits do not flip it.
  - **Canonical-tool passage (lines 236–240)** — rewrite from
    "`AskUserQuestion` is the canonical Claude Code tool for any
    multi-choice user prompt …" to qualify it as the orchestrator's
    tool, and direct subagents to the envelope instead. Target text:
    "`AskUserQuestion` is the canonical Claude Code tool for any
    multi-choice user prompt **from the orchestrator** —
    design/structure approval, worktree-vs-in-place, shipping
    options. **Subagents that need user input emit the
    `openQuestions` envelope per
    `skills/agent-open-questions/SKILL.md`; the orchestrator
    renders the prompt on their behalf.**"
**Tests / verification checkpoint:**
1. `grep -n agent-open-questions skills/team/SKILL.md` — finds the
   cross-link in the phase loop and in the canonical-tool passage.
2. `grep -n openQuestions skills/team/SKILL.md` and `grep -n
   SendMessage skills/team/SKILL.md` both hit in the phase-loop
   section.
3. `grep -n dispatch-failure.md skills/team/SKILL.md` finds the
   failure-path reference.
4. `grep -n 'from the orchestrator' skills/team/SKILL.md` finds the
   qualifier added to the canonical-tool passage.
5. Grep for the free-text escape-hatch language (e.g. `grep -n
   'plain-text follow-up' skills/team/SKILL.md` or equivalent
   phrase) finds the documented pattern.
6. Manual read: the phase loop describes parse →
   `AskUserQuestion` → (optional free-text follow-up) →
   `SendMessage` as the documented sequence for non-empty envelopes.
**Atomic commit message:** `feat(skills): wire orchestrator envelope
parse + SendMessage resume`
**Rollback:** `git revert` this slice's commit; the new skill from
slice 1 is still present but dormant.

### Slice 3: Cross-link the protocol from qrspi-workflow
**Goal:** The 11 unmigrated agents discover the protocol through the
methodology skill they already load, without changing their prompts.
**Layers touched:** workflow skill prose.
**Files touched:**
- `skills/qrspi-workflow/SKILL.md` (edit) — add a one-line pointer
  to `skills/agent-open-questions/SKILL.md` next to the existing
  "surface as an open question" language at lines 215–216 (inside
  the Research Isolation section's step 3, or immediately after it).
  Cite the skill as the canonical mechanism for surfacing open
  questions interactively.
**Tests / verification checkpoint:**
1. `grep -n 'agent-open-questions' skills/qrspi-workflow/SKILL.md`
   returns a single match within ~5 lines of the existing
   "surface as an open question" line.
2. The cross-link is a sentence-level pointer, not a re-statement of
   the protocol (the protocol stays in slice 1's skill — Decision 1).
**Atomic commit message:** `docs(skills): point qrspi-workflow at
agent-open-questions skill`
**Rollback:** `git revert` this slice's commit.

### Slice 4: Migrate design-author onto the envelope
**Goal:** A `/team-design` dispatch (or the DESIGN phase of `/team`)
on a new topic emits a JSON envelope and produces a `design.md`
with no caveat block. This is the first slice that ships
user-visible behavior — it removes the symptom the user reported.
**Layers touched:** agent frontmatter + interactive-step prose +
revision-dispatch note + summary-return clarification.
**Files touched:**
- `agents/design-author.md` (edit):
  - Line 6 `tools:` — remove `, AskUserQuestion`.
  - Lines 91–139 (the `## MANDATORY interactive step` section) —
    rewrite to:
    (a) Load `skills/agent-open-questions/SKILL.md` (add to the
        `skills:` frontmatter list at lines 8–9 alongside
        `product-thinking`).
    (b) Replace the `AskUserQuestion({...})` example with the
        fenced ```` ```json ```` envelope example (`{"openQuestions":
        [...]}`).
    (c) State the **STOP** rule: emit the envelope as the final
        assistant message; do not write `design.md` until the
        orchestrator resumes via `SendMessage` with the user's
        selections.
    (d) Preserve the existing imperative tone (MUST / MANDATORY) —
        redirect what is mandated (emit envelope, do not call
        `AskUserQuestion`).
    (e) Keep the revision-dispatch exception (lines 137–139):
        envelope is optional on revisions; emit only if feedback
        raised new ambiguities.
  - Lines 189–191 (Rules section "Interactive before written.") —
    replace `via AskUserQuestion` with "via the
    agent-open-questions envelope" so the rule still binds.
  - Lines 221–223 (summary return) — clarify that the summary JSON
    (`{designPath, id, openQuestionsResolved: N}`) is emitted only
    on the post-resume turn (when the artifact is written), not on
    the envelope turn (matches Decision 5 first-block-wins).
**Tests / verification checkpoint:**
1. `grep AskUserQuestion agents/design-author.md` returns **zero
   hits** (frontmatter, MANDATORY step, Rules section all cleaned).
2. `grep -n openQuestions agents/design-author.md` finds the
   envelope shape and the load of the new skill.
3. `grep -n agent-open-questions agents/design-author.md` finds the
   skill load.
4. The dev hook `.claude/hooks/check-registry-sync.mjs` continues to
   pass on save (it cross-checks `name:`; tools removal does not
   trigger it — confirmed in design risk notes).
5. **End-to-end smoke (manual, after slice 4 lands):** run
   `/team-design` against any existing approved-research topic. The
   subagent's final tool result contains a fenced ```` ```json ````
   block with `openQuestions`; the orchestrator (now parsing per
   slice 2) renders an `AskUserQuestion`; after answers, the
   subagent writes `design.md` without a caveat block.
**Atomic commit message:** `feat(agents): migrate design-author to
agent-open-questions envelope`
**Rollback:** `git revert` this slice's commit; design-author
returns to (broken) prior behavior but the orchestrator parse step
from slice 2 simply finds no envelope and proceeds.

### Slice 5: Migrate questioner onto the envelope
**Goal:** A `/team` dispatch with ambiguous multi-repo signals
produces a structured `AskUserQuestion` (Single vs Multi) for repo
scope rather than prose the orchestrator must re-render, and the
orchestrator follows up with a plain-text path-collection question
when the user picks Multi-repo. Covers the second of the two
acceptance signals.
**Layers touched:** agent frontmatter + multi-repo prose.
**Files touched:**
- `agents/questioner.md` (edit):
  - Line 6 `tools:` — remove `, AskUserQuestion`.
  - Lines 196–213 (multi-repo block) — rewrite to:
    (a) Load `skills/agent-open-questions/SKILL.md` (add to
        `skills:` frontmatter at lines 8–9).
    (b) Replace "ask the user via `AskUserQuestion`" with "emit the
        agent-open-questions envelope and STOP".
    (c) Show the envelope shape: a **single, label-only question**
        with header `Repos` and two options (Single repo
        (Recommended if unsure) / Multi-repo). Each option's
        `description` names the trade-off; the Multi-repo
        `description` explicitly notes that the orchestrator will
        follow up with a plain-text question for repo paths and
        slugs.
    (d) Path-and-slug collection is now an **orchestrator
        responsibility**, not the questioner's: if the user picks
        Multi-repo, the orchestrator follows up with a plain-text
        question asking for repo paths and slugs (one per line,
        format `<slug>: <absolute-path>`). The orchestrator
        validates each path with `git -C <path> rev-parse
        --git-dir` and `SendMessage`s the validated list (or any
        validation errors) back to the questioner.
    (e) On resume, the questioner writes `repos.md` from the
        validated list (or, on validation errors surfaced by the
        orchestrator, re-emits the envelope or proceeds per
        existing error-handling guidance).
    (f) This sub-flow is the **canonical worked example** for the
        free-text escape hatch documented in slice 2; cite it.
**Tests / verification checkpoint:**
1. `grep AskUserQuestion agents/questioner.md` returns **zero hits**.
2. `grep -n openQuestions agents/questioner.md` finds the envelope
   example.
3. `grep -n agent-open-questions agents/questioner.md` finds the
   skill load.
4. Grep finds the `<slug>: <absolute-path>` format string in the
   questioner's revised multi-repo section.
5. **End-to-end smoke (manual):** run `/team` with a multi-repo
   description (e.g., "wire the `web` app and the `api` service");
   the questioner emits a `Repos`-header envelope; the orchestrator
   renders it via `AskUserQuestion`; on Multi-repo, the orchestrator
   asks for paths as a plain-text follow-up; the orchestrator
   parses the response into the validated list and `SendMessage`s
   it back to the questioner; `repos.md` is written with the
   correct entries.
**Atomic commit message:** `feat(agents): migrate questioner to
agent-open-questions envelope`
**Rollback:** `git revert` this slice's commit.

### Slice 6: Update plugin metadata
**Goal:** Project documentation correctly reflects the new skill
count so future contributors discover all 28 skills.
**Layers touched:** project router doc.
**Files touched:**
- `CLAUDE.md` (edit) — change `## Skills (27)` heading to
  `## Skills (28)`.
**Tests / verification checkpoint:**
1. `grep '^## Skills (28)' CLAUDE.md` returns exactly one match.
2. `grep '^## Skills (27)' CLAUDE.md` returns nothing.
**Atomic commit message:** `chore(docs): bump skills count to 28`
**Rollback:** flip the number back to 27.

## Cross-slice concerns

- **Skill path is load-bearing.** `skills/agent-open-questions/SKILL.md`
  is referenced by name in slices 2, 3, 4, 5. If slice 1's path
  changes, all four downstream slices must update in lockstep.
  Treat the path as a contract pinned in slice 1.
- **Envelope shape is the contract.** The fenced ```` ```json ````
  block with top-level `openQuestions` key is the wire format.
  Slices 1 (definition), 2 (parser), 4 and 5 (producers) must
  agree exactly. If slice 4 or 5 needs to diverge (e.g., a free-text
  option type the skill doesn't define), it must extend slice 1
  first, not introduce a per-agent dialect.
- **Free-text escape hatch is a cross-slice pattern.** Slice 1
  states the rule (`AskUserQuestion` is label-only; describe the
  follow-up in the option `description`), slice 2 implements the
  orchestrator-side plain-text follow-up step, slice 5 is the
  canonical worked example (multi-repo path collection). All three
  must agree on the mechanism.
- **Decision 5 first-block-wins.** Slices 2, 4, and 5 all depend on
  this rule: the summary JSON (`{designPath, id, ...}`) at the end
  of a normal artifact-complete message must not be mistaken for an
  envelope. The parser (slice 2) keys on the presence of the
  `openQuestions` array; producers (slices 4 and 5) must not put an
  `openQuestions` array in their summary returns.
- **Revision-dispatch behavior is preserved.** Slices 4 and 5 must
  keep the existing "skip the interactive step on revisions unless
  feedback raises new ambiguities" rule, redirected to the envelope.
- **No new hook.** Per design "Out of scope," no runtime hook
  validates the envelope. The dev hook
  `.claude/hooks/check-registry-sync.mjs` continues to pass
  (registry doesn't track `tools:`); the runtime hook
  `hooks/post-write-validate.mjs` continues to pass (new SKILL.md
  has frontmatter).

## Acceptance signals

(Restated verbatim-in-spirit from `task.md` so the implementer
verifies end-to-end after slice 6 lands.)

1. After slices 2 + 4: `design-author` emits a JSON envelope; the
   orchestrator renders `AskUserQuestion`; the produced `design.md`
   contains **no prose caveat block** about `AskUserQuestion` being
   "unavailable inside subagents."
2. After slices 2 + 5: `questioner` emits a JSON envelope for
   multi-repo disambiguation; the orchestrator renders
   `AskUserQuestion` rather than re-rendering prose questions; and
   for Multi-repo the orchestrator follows up with a plain-text
   path-collection question and `SendMessage`s the result back.
3. After all 6 slices: a full `/team` run on a new feature shows
   structured `AskUserQuestion` interactions at the QUESTION and
   DESIGN phases.
4. Fix is at the root cause (contract + prompts), not symptom
   removal — verified by zero `AskUserQuestion` references in the
   two migrated agents' files (slices 4 + 5).
5. The new shared skill (slice 1) is the reference implementation
   for any future agent that grows an interactive step.

## Verification ladder

- After **slice 1**: file exists; SKILL.md hook passes; greps for
  `openQuestions` and `SendMessage` hit; free-text escape-hatch
  note is present.
- After **slice 2**: greps in `skills/team/SKILL.md` for
  `agent-open-questions`, `openQuestions`, `SendMessage`,
  `dispatch-failure.md`, `from the orchestrator`, and the
  free-text follow-up phrase all hit; phase-loop prose reads as a
  parse → render → (optional free-text follow-up) → resume
  sequence; the canonical-tool passage now scopes
  `AskUserQuestion` to the orchestrator.
- After **slice 3**: grep in `skills/qrspi-workflow/SKILL.md` for
  `agent-open-questions` hits exactly once, adjacent to existing
  "surface as an open question" language.
- After **slice 4**: zero `AskUserQuestion` hits in
  `agents/design-author.md`; envelope shape present; smoke
  `/team-design` run on a stub topic emits an envelope rendered by
  the orchestrator; `design.md` has no caveat block.
- After **slice 5**: zero `AskUserQuestion` hits in
  `agents/questioner.md`; smoke multi-repo `/team` run produces a
  structured `Repos` question; the orchestrator follows up with a
  plain-text path question; `repos.md` is written correctly.
- After **slice 6**: `grep '^## Skills (28)' CLAUDE.md` returns
  exactly one match; `grep '^## Skills (27)' CLAUDE.md` returns
  nothing.
- **End-to-end (post-slice 6)**: a full `/team "<some new
  feature>"` run on a fresh topic produces structured
  `AskUserQuestion` interactions at QUESTION and DESIGN phases with
  no caveat prose anywhere in `design.md`. Matches acceptance
  signal 3.

## Rollback strategy

- **Slice 1**: delete `skills/agent-open-questions/SKILL.md`.
- **Slice 2**: `git revert` — the new skill (slice 1) remains
  dormant; no agent has been migrated yet; the canonical-tool
  passage reverts with the same commit.
- **Slice 3**: `git revert` — pointer removal is purely cosmetic.
- **Slice 4**: `git revert` — `design-author` returns to its prior
  (broken) behavior; orchestrator parse from slice 2 simply finds
  no envelope.
- **Slice 5**: `git revert` — same as slice 4 for `questioner`;
  multi-repo path collection reverts to the prior (also broken)
  prompt path.
- **Slice 6**: flip the skills count back to 27 in `CLAUDE.md`.

## Out of structure

(Restated from `design.md` `## Out of scope` so the planner does not
pull these into the tactical plan.)

- Updating the other 11 agents (`file-finder`, `researcher`,
  `structure-planner`, `planner`, `test-architect`, `implementer`,
  `verifier`, `code-reviewer`, `security-reviewer`, `ux-reviewer`,
  `technical-writer`).
- Any runtime hook that mechanically validates the envelope or
  blocks a subagent's `AskUserQuestion` call.
- Modifying Claude Code itself or the `AskUserQuestion` /
  `SendMessage` tool surfaces.
- Changes to the orchestrator's three existing `AskUserQuestion`
  sites (design gate, structure gate, PR ship) — except the slice 2
  canonical-tool passage edit, which only adds a qualifier and does
  not change the three sites' behavior.
- Backfilling the protocol into in-flight topics whose `design.md`
  was produced under the old behavior.
- A `repos.md` schema change.
- Inlining the new skill into `skills/qrspi-workflow/SKILL.md` even
  if it ends up under ~40 lines — Decision 1 (separate skill) is
  binding; revisit only in a future design.
