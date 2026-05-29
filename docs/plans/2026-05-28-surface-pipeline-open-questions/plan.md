---
topic: surface-pipeline-open-questions
date: 2026-05-28
phase: plan
---

# Plan: surface-pipeline-open-questions

## Context

Six sequential slices land a shared protocol for subagent interactive
questions, then teach the orchestrator to parse it, then migrate
`design-author` and `questioner` onto it, then update plugin metadata.
The approved structure is at
`/Users/matthew/code/bostonaholic/team/docs/plans/2026-05-28-surface-pipeline-open-questions/structure.md`;
the contract is at
`/Users/matthew/code/bostonaholic/team/docs/plans/2026-05-28-surface-pipeline-open-questions/design.md`.
Single-repo topic — all edits land in
`/Users/matthew/code/bostonaholic/team`.

## Slices

### Slice 1: Author the shared protocol skill

**Order:** 1 of 6 — runs first; no dependencies.

**Dependencies:** none.

**File operations:**

- `Write` `/Users/matthew/code/bostonaholic/team/skills/agent-open-questions/SKILL.md` (new file).

**Pre-edit grep:** none — confirm absence:

```sh
test ! -e /Users/matthew/code/bostonaholic/team/skills/agent-open-questions/SKILL.md && echo "ok-new"
```

**Full file contents to write:**

````markdown
---
name: agent-open-questions
description: Protocol a subagent uses to surface open questions to the user. Emit a fenced JSON envelope with an openQuestions array as the final assistant message and STOP; the orchestrator renders AskUserQuestion and resumes via SendMessage with the user's selections. Load this skill from any agent whose prompt has an interactive step.
---

# Agent Open Questions Protocol

The single source of truth for how a subagent surfaces multi-choice
questions to the user. Subagents do **not** call `AskUserQuestion`
themselves — the tool's user-visibility from inside a subagent is
undefined. Instead, a subagent emits a structured envelope in its final
assistant message, the orchestrator parses it, calls `AskUserQuestion`,
and resumes the subagent via `SendMessage(to: <agentId>, message: ...)`
with the user's selections.

## Rule: do not call AskUserQuestion from inside a subagent

A subagent MUST NOT call `AskUserQuestion`. Even if the tool is wired in
the agent's `tools:` frontmatter, the subagent has no reliable way to
surface the prompt to the user. Emitting prose ("I would ask the user
but the tool is unavailable...") is also forbidden — it replaces the
contract with a rationalization. Use the envelope below instead.

## The envelope

The subagent's **final assistant message** ends with a fenced JSON block
whose top-level object contains an `openQuestions` array. Each item
mirrors the shape `AskUserQuestion` itself accepts: `question`,
`header`, and `options` (each option carries `label` and
`description`).

```json
{
  "openQuestions": [
    {
      "question": "How should rate limiting be enforced for unauthenticated requests?",
      "header": "Rate limit",
      "options": [
        { "label": "Token bucket per IP (Recommended)", "description": "Simple, no shared state. Trade-off: NAT'd users share a bucket." },
        { "label": "Sliding window per IP",             "description": "More accurate burst handling. Trade-off: needs Redis." },
        { "label": "No limit on unauthenticated path",  "description": "Smallest change. Trade-off: leaves DoS surface open." }
      ]
    }
  ]
}
```

After emitting the envelope, **STOP**. Do not write any artifact on the
same turn — wait for the orchestrator to resume you via `SendMessage`
with the user's selections.

## Orchestrator parse rule (Decision 5: first-block-wins)

The orchestrator scans the subagent's final tool result for fenced
```` ```json ```` blocks in order. The **first** block whose top-level
object contains an `openQuestions` array is the envelope. Other fenced
JSON blocks (such as a subagent's `{designPath, ...}` summary return at
the very end of an artifact-complete message) are ignored when an
envelope is present. Subagents MUST NOT include an `openQuestions` key
in their summary returns.

## Resume contract

After the user answers, the orchestrator resumes the same subagent via
the Task tool's `SendMessage(to: <agentId>, message: ...)` mechanism.
The `message` is the user's selections verbatim (plus any free-text
follow-up answer the orchestrator collected — see "Free-text escape
hatch" below). The subagent receives the selections as a new user turn
with its full prior transcript intact; it is not a fresh dispatch.

## Size caps

- **≤ 4 questions per envelope.** `AskUserQuestion` accepts 1–4
  questions per call. If you have more than 4 sharp questions, split or
  defer the lower-priority ones to a `## Open questions (deferred)`
  section in your artifact.
- **`description` ≤ ~200 characters.** Each option's `description`
  names the approach and its trade-off in roughly one sentence.

## Zero-question case

If the subagent has nothing to ask, **omit the envelope entirely** and
proceed to write its artifact. Do not emit an empty
`{"openQuestions": []}` — the orchestrator treats the absence of an
envelope as "nothing to render."

## Free-text escape hatch

`AskUserQuestion` returns only the chosen `label` — there is no
free-text field. When a subagent genuinely needs free-text input (for
example: collecting absolute repo paths after a Single/Multi-repo
choice), state in the chosen option's `description` that the
orchestrator will follow up with a plain-text question after the user
selects that option. The orchestrator asks the plain-text follow-up,
collects the answer, and concatenates it into the resume `SendMessage`.
The canonical worked example is the questioner's multi-repo flow.

## Revision-dispatch exception

On a revision dispatch (the human gate rejected an earlier draft and
the subagent is re-run with the user's verbatim feedback), the envelope
is **optional**. Emit it only if the feedback raises new ambiguities.
If everything the feedback asks for is unambiguous, write the revised
artifact directly.

## Malformed envelope path (two attempts)

If the orchestrator's parse step fails (malformed JSON, missing `label`
on an option, etc.):

1. **Attempt 1:** the orchestrator `SendMessage`s the subagent with the
   exact parse error verbatim and asks for a corrected envelope.
2. **Attempt 2 fails:** the orchestrator writes the raw tool result to
   `docs/plans/<id>/dispatch-failure.md` with frontmatter
   `phase: <current-phase>, status: parse-failed`, marks the phase
   halted in TodoWrite, and surfaces a clear message to the user naming
   the artifact path.

Missing `description` on an option is filled with the empty string and
rendered. Missing `label` is a parse failure (the user has nothing to
click).

## Envelope + summary collision

A subagent that emits both an envelope and its summary JSON on the same
turn is harmless: Decision 5 (first-block-wins) selects the envelope;
the summary is ignored on that turn. The subagent re-emits the summary
after the resume, when the artifact is written.

## Parallel-dispatch limitation

The only parallel dispatch in the pipeline today is RESEARCH
(`file-finder` + `researcher`), neither of which uses this protocol.
If a future phase dispatches two agents in parallel and both emit
envelopes, the orchestrator does not have a defined ordering rule yet.
Avoid emitting envelopes from parallel agents until the protocol is
extended.

## Reference implementations

- `agents/design-author.md` — DESIGN phase open questions.
- `agents/questioner.md` — multi-repo disambiguation, including the
  free-text escape hatch for path collection.
````

**Acceptance tests (from structure.md slice 1 verification):**

```sh
# 1. File exists
test -f /Users/matthew/code/bostonaholic/team/skills/agent-open-questions/SKILL.md && echo "ok-1"

# 2. The runtime hooks/post-write-validate.mjs SKILL.md check passes — confirmed automatically on save.
head -1 /Users/matthew/code/bostonaholic/team/skills/agent-open-questions/SKILL.md | grep -q '^---$' && echo "ok-2"

# 3. Grep openQuestions and SendMessage both hit
grep -q openQuestions /Users/matthew/code/bostonaholic/team/skills/agent-open-questions/SKILL.md && echo "ok-3a"
grep -q SendMessage /Users/matthew/code/bostonaholic/team/skills/agent-open-questions/SKILL.md && echo "ok-3b"

# 4. Manual read: Decisions 1–5 covered, edge cases (zero-question, 4-question cap,
#    malformed JSON two-attempt path, envelope + summary collision) stated,
#    free-text escape hatch present.
grep -q 'first-block-wins\|first .* block' /Users/matthew/code/bostonaholic/team/skills/agent-open-questions/SKILL.md && echo "ok-4-parse-rule"
grep -q 'Free-text escape hatch' /Users/matthew/code/bostonaholic/team/skills/agent-open-questions/SKILL.md && echo "ok-4-escape-hatch"
grep -q 'dispatch-failure.md' /Users/matthew/code/bostonaholic/team/skills/agent-open-questions/SKILL.md && echo "ok-4-failure-path"
grep -q 'Zero-question' /Users/matthew/code/bostonaholic/team/skills/agent-open-questions/SKILL.md && echo "ok-4-zero"
grep -q '4 questions\|≤ 4 questions' /Users/matthew/code/bostonaholic/team/skills/agent-open-questions/SKILL.md && echo "ok-4-cap"
grep -q 'collision\|summary.*same turn\|envelope.*summary' /Users/matthew/code/bostonaholic/team/skills/agent-open-questions/SKILL.md && echo "ok-4-collision"
```

**Commit:** `feat(skills): add agent-open-questions protocol skill`

---

### Slice 2: Teach the orchestrator to parse the envelope and resume

**Order:** 2 of 6.

**Dependencies:** slice 1 committed (the skill path is referenced).

**File operations:**

- `Edit` `/Users/matthew/code/bostonaholic/team/skills/team/SKILL.md` — two edits: (a) insert a new step in the phase loop between current step 4 and step 5; (b) rewrite the canonical-tool passage at lines 237–242.

**Pre-edit grep (locate insertion points):**

```sh
grep -n '4. Dispatch the agent(s)' /Users/matthew/code/bostonaholic/team/skills/team/SKILL.md
grep -n '5. Write each returned artifact' /Users/matthew/code/bostonaholic/team/skills/team/SKILL.md
grep -n '`AskUserQuestion` is the canonical' /Users/matthew/code/bostonaholic/team/skills/team/SKILL.md
```

#### Edit 2a — phase-loop insertion

The current phase loop is a fenced code block (lines 57–84). Step 4
reads "Dispatch the agent(s) (parallel where the phase table marks
them)." and step 5 begins "Write each returned artifact ...". Insert a
new step 5 between them and renumber the rest (5 → 6, 6 → 7, 7 → 8,
8 → 9). The renumbered step 9 becomes "Goto loop."

**`Edit`** with `old_string` (preserves the exact indentation inside
the fenced code block):

```
  4. Dispatch the agent(s) (parallel where the phase table marks them).
  5. Write each returned artifact to docs/plans/<id>/<name>.md
     with the YAML frontmatter the agent specifies (see the agent file
     and skills/qrspi-workflow/SKILL.md).
  6. Run the gate for this phase:
```

**`new_string`:**

```
  4. Dispatch the agent(s) (parallel where the phase table marks them).
  5. Parse the subagent's final assistant text for an open-questions
     envelope (see `skills/agent-open-questions/SKILL.md` — the
     canonical contract):
     a. Scan the Task tool result for fenced ```json blocks in order.
        Per Decision 5 (first-block-wins), the FIRST block whose
        top-level object contains an `openQuestions` array is the
        envelope. Ignore other fenced JSON blocks (e.g. the
        `{designPath, ...}` summary at the end of an artifact-complete
        message) when an envelope is present.
     b. If an envelope is present, call `AskUserQuestion` with the
        parsed `openQuestions` array verbatim.
     c. Free-text escape hatch: if a chosen option's `description`
        declares that the orchestrator must follow up with free-text
        input (or the subagent's prompt explicitly requires it for that
        branch), ask the user a plain-text follow-up question and
        incorporate the response into the resume message. This is
        necessary because `AskUserQuestion` returns only the chosen
        `label` — no free-text field. The questioner's multi-repo flow
        is the canonical worked example.
     d. Resume the same subagent via the Task tool's
        `SendMessage(to: <agentId>, message: <user selections verbatim,
        plus any free-text follow-up response>)`. The subagent receives
        the selections as a new user turn with its prior transcript
        intact; this is NOT a fresh dispatch.
     e. On malformed JSON or a missing `label`, follow the two-attempt
        path: attempt 1 = `SendMessage` the subagent the exact parse
        error and request a corrected envelope; attempt 2 failure =
        write `docs/plans/<id>/dispatch-failure.md` with frontmatter
        `phase: <current>, status: parse-failed`, mark the phase halted
        in TodoWrite, and surface the artifact path to the user.
     f. If no envelope is present, proceed to step 6.
  6. Write each returned artifact to docs/plans/<id>/<name>.md
     with the YAML frontmatter the agent specifies (see the agent file
     and skills/qrspi-workflow/SKILL.md).
  7. Run the gate for this phase:
```

Then renumber the existing steps 6, 7, 8 (which were "Run the gate" /
"Update TodoWrite" / "Goto loop") so they become 7, 8, 9. Use these
two follow-up `Edit`s:

**`Edit`** `old_string`:

```
  7. Update TodoWrite — mark current phase `completed` and the next one
     `in_progress`.
  8. Goto loop.
```

**`new_string`:**

```
  8. Update TodoWrite — mark current phase `completed` and the next one
     `in_progress`.
  9. Goto loop.
```

(Note: the original "Run the gate" was step 6 and is now step 7 —
captured already by the renumber inside Edit 2a's `new_string`. The
two sub-bullets "HUMAN" / "MECHANICAL" / "ROUTER-EMIT" / "AGGREGATE"
under "Run the gate" do not need to change.)

#### Edit 2b — canonical-tool passage rewrite

**`Edit`** `old_string` (anchors on lines 237–242 of the current file):

```
- `AskUserQuestion` is the canonical Claude Code tool for any
  multi-choice user prompt — design/structure approval, worktree-vs-
  in-place, shipping options. Free-text prompts ("Do you approve?") are
  not the convention. Free-form text input remains appropriate when the
  question genuinely has no enumerable options (e.g. capturing the
  user's revision feedback after they pick "Request changes").
```

**`new_string`:**

```
- `AskUserQuestion` is the canonical Claude Code tool for any
  multi-choice user prompt **from the orchestrator** — design/structure
  approval, worktree-vs-in-place, shipping options. Free-text prompts
  ("Do you approve?") are not the convention. Free-form text input
  remains appropriate when the question genuinely has no enumerable
  options (e.g. capturing the user's revision feedback after they pick
  "Request changes"). **Subagents that need user input emit the
  `openQuestions` envelope per `skills/agent-open-questions/SKILL.md`;
  the orchestrator parses, renders the prompt via `AskUserQuestion`,
  and resumes the subagent via `SendMessage`. The orchestrator-side
  parse + render + resume sequence is documented in the phase loop
  above (step 5).** Subagents must not call `AskUserQuestion` directly.
```

**Acceptance tests (from structure.md slice 2 verification):**

```sh
# 1. Cross-link present in phase loop and canonical-tool passage
grep -cn agent-open-questions /Users/matthew/code/bostonaholic/team/skills/team/SKILL.md
# Expect: at least 2 matches.

# 2. openQuestions and SendMessage both hit in phase-loop section
grep -n openQuestions /Users/matthew/code/bostonaholic/team/skills/team/SKILL.md
grep -n SendMessage /Users/matthew/code/bostonaholic/team/skills/team/SKILL.md

# 3. dispatch-failure.md referenced
grep -n 'dispatch-failure.md' /Users/matthew/code/bostonaholic/team/skills/team/SKILL.md

# 4. The "from the orchestrator" qualifier landed
grep -n 'from the orchestrator' /Users/matthew/code/bostonaholic/team/skills/team/SKILL.md

# 5. Free-text escape hatch language present
grep -n 'plain-text follow-up\|Free-text escape hatch' /Users/matthew/code/bostonaholic/team/skills/team/SKILL.md

# 6. Manual read: phase loop describes parse → AskUserQuestion → (optional free-text follow-up) → SendMessage.
```

**Commit:** `feat(skills): wire orchestrator envelope parse + SendMessage resume`

---

### Slice 3: Cross-link the protocol from qrspi-workflow

**Order:** 3 of 6.

**Dependencies:** slice 1 committed (skill must exist for the link to
be valid).

**File operations:**

- `Edit` `/Users/matthew/code/bostonaholic/team/skills/qrspi-workflow/SKILL.md` — add a one-line pointer next to step 3 of the Research Isolation section (lines 215–216).

**Pre-edit grep:**

```sh
grep -n 'surface that as an open question' /Users/matthew/code/bostonaholic/team/skills/qrspi-workflow/SKILL.md
# Expected match around line 215.
```

**`Edit`** `old_string`:

```
3. **Procedural** — if a researcher needs context the questions lack, it must
   surface that as an open question rather than guessing the intent.
```

**`new_string`:**

```
3. **Procedural** — if a researcher needs context the questions lack, it must
   surface that as an open question rather than guessing the intent.
   The canonical mechanism for surfacing open questions interactively
   from any subagent is `skills/agent-open-questions/SKILL.md` — emit
   the envelope, let the orchestrator render and resume.
```

**Acceptance tests (from structure.md slice 3 verification):**

```sh
# 1. Pointer present, within ~5 lines of the existing "surface as an open question" line
grep -n agent-open-questions /Users/matthew/code/bostonaholic/team/skills/qrspi-workflow/SKILL.md
# Expect: exactly one match.

grep -c agent-open-questions /Users/matthew/code/bostonaholic/team/skills/qrspi-workflow/SKILL.md
# Expect: 1.

# 2. Manual read: the addition is a sentence-level pointer, not a re-statement of the protocol.
```

**Commit:** `docs(skills): point qrspi-workflow at agent-open-questions skill`

---

### Slice 4: Migrate design-author onto the envelope

**Order:** 4 of 6.

**Dependencies:** slices 1 and 2 committed (skill exists, orchestrator
parses the envelope).

**File operations:**

- `Edit` `/Users/matthew/code/bostonaholic/team/agents/design-author.md` — four edits described below.

**Pre-edit grep:**

```sh
grep -n '^tools:' /Users/matthew/code/bostonaholic/team/agents/design-author.md
grep -n '^skills:' /Users/matthew/code/bostonaholic/team/agents/design-author.md
grep -n 'MANDATORY interactive step' /Users/matthew/code/bostonaholic/team/agents/design-author.md
grep -n 'Interactive before written' /Users/matthew/code/bostonaholic/team/agents/design-author.md
grep -n 'Output to orchestrator' /Users/matthew/code/bostonaholic/team/agents/design-author.md
```

#### Edit 4a — tools frontmatter

**`Edit`** `old_string`:

```
tools: Read, Write, Edit, Grep, Glob, AskUserQuestion
```

**`new_string`:**

```
tools: Read, Write, Edit, Grep, Glob
```

#### Edit 4b — skills frontmatter (add agent-open-questions)

**`Edit`** `old_string`:

```
skills:
  - product-thinking
---
```

**`new_string`:**

```
skills:
  - product-thinking
  - agent-open-questions
---
```

#### Edit 4c — rewrite MANDATORY interactive step (lines 90–139)

**`Edit`** `old_string` (the whole block, verbatim from the current
file):

```
## MANDATORY interactive step

Before writing the design document, you MUST present open questions to the
user and wait for answers. Do not draft the design first and then ask.

Use the `AskUserQuestion` tool — Claude Code's built-in multi-choice
prompt — to surface each question. Do **not** print a markdown numbered
list and wait for free-text replies; `AskUserQuestion` renders the choices
as a structured form, captures the user's selection (with optional notes),
and ensures every question has a labeled trade-off.

Present at most 3–5 sharp questions in a single `AskUserQuestion` call
(the tool accepts 1–4 questions per call; if you truly need 5, split into
two calls). If you have more than 5 open questions, either resolve some
autonomously by reading more code, or batch the lowest-priority ones into
a "deferred" list in the design.

Each question must be:

- A complete sentence ending in a question mark.
- Paired with a short `header` chip (≤ 12 chars) and 2–4 mutually
  exclusive `options`. Each option carries a 1–5 word `label` and a
  `description` that names the approach AND its trade-off.
- If you have a recommended option, list it first and append
  "(Recommended)" to its label per the tool's convention.

Example call shape:

```
AskUserQuestion({
  questions: [{
    question: "How should rate limiting be enforced for unauthenticated requests?",
    header: "Rate limit",
    options: [
      { label: "Token bucket per IP (Recommended)", description: "Simple, no shared state. Trade-off: NAT'd users share a bucket." },
      { label: "Sliding window per IP",             description: "More accurate burst handling. Trade-off: needs Redis." },
      { label: "No limit on unauthenticated path",  description: "Smallest change. Trade-off: leaves DoS surface open." }
    ],
    multiSelect: false
  }]
})
```

After the call returns, incorporate the user's answers into `## Decisions
made` in the design. Reference each chosen option by its label so the
trade-off the user accepted is auditable.

On a revision dispatch, skip the open-question phase unless the user's
feedback raises new ambiguities — in that case, ask the follow-ups via
`AskUserQuestion` before re-drafting.
```

**`new_string`:**

````
## MANDATORY interactive step

Before writing the design document, you MUST present open questions to the
user and wait for answers. Do not draft the design first and then ask.

Load `skills/agent-open-questions/SKILL.md` (preloaded via the `skills:`
frontmatter — read it if it isn't already in context). It is the canonical
contract for surfacing open questions from a subagent. **Do not call
`AskUserQuestion` yourself** — its user-visibility from inside a subagent
is undefined. Instead, emit the `openQuestions` envelope as your final
assistant message and STOP. The orchestrator parses the envelope, renders
`AskUserQuestion` on your behalf, and resumes you via
`SendMessage(to: <agentId>, message: <user selections>)`. **Do not write
`design.md` on the envelope turn** — the artifact is written only on the
post-resume turn, after the orchestrator has supplied the user's answers.

Present at most 4 sharp questions in a single envelope (the
`AskUserQuestion` tool accepts 1–4 questions per call). If you have more
than 4 open questions, either resolve some autonomously by reading more
code, or batch the lowest-priority ones into a "deferred" list in the
design.

Each question must be:

- A complete sentence ending in a question mark.
- Paired with a short `header` chip (≤ 12 chars) and 2–4 mutually
  exclusive `options`. Each option carries a 1–5 word `label` and a
  `description` that names the approach AND its trade-off.
- If you have a recommended option, list it first and append
  "(Recommended)" to its label per the tool's convention.

Example envelope (emit this as a fenced JSON block at the end of your
final assistant message):

```json
{
  "openQuestions": [
    {
      "question": "How should rate limiting be enforced for unauthenticated requests?",
      "header": "Rate limit",
      "options": [
        { "label": "Token bucket per IP (Recommended)", "description": "Simple, no shared state. Trade-off: NAT'd users share a bucket." },
        { "label": "Sliding window per IP",             "description": "More accurate burst handling. Trade-off: needs Redis." },
        { "label": "No limit on unauthenticated path",  "description": "Smallest change. Trade-off: leaves DoS surface open." }
      ]
    }
  ]
}
```

After the orchestrator resumes you with the user's selections (a new user
turn carrying the chosen labels verbatim), incorporate the answers into
`## Decisions made` in the design. Reference each chosen option by its
label so the trade-off the user accepted is auditable.

On a revision dispatch, skip the envelope unless the user's feedback
raises new ambiguities — in that case, emit a fresh envelope per the same
protocol before re-drafting.
````

#### Edit 4d — Rules-section "Interactive before written"

**`Edit`** `old_string`:

```
- **Interactive before written.** Open questions go to the user first via
  `AskUserQuestion`; the document captures their answers as `## Decisions
  made`. Never draft the document and then ask.
```

**`new_string`:**

```
- **Interactive before written.** Open questions go to the user first via
  the agent-open-questions envelope (see
  `skills/agent-open-questions/SKILL.md`); the document captures their
  answers as `## Decisions made`. Never draft the document and then ask.
```

#### Edit 4e — Output-to-orchestrator clarification

The current "## Output to orchestrator" section (lines 219–223) says the
agent returns `{designPath, id, openQuestionsResolved: <number>}`.
Clarify that the summary is only emitted on the post-resume turn (so it
doesn't collide with the envelope per Decision 5 first-block-wins).

**`Edit`** `old_string`:

```
## Output to orchestrator

When done, return a short summary to the orchestrator:
`{designPath, id, openQuestionsResolved: <number>}`. The orchestrator
will then run the human gate (present the design, capture approval).
```

**`new_string`:**

```
## Output to orchestrator

When done — that is, on the post-resume turn when you actually write
`design.md` — return a short summary to the orchestrator:
`{designPath, id, openQuestionsResolved: <number>}`. The orchestrator
will then run the human gate (present the design, capture approval).
**Do not include this summary on the envelope turn** — per the
agent-open-questions Decision 5 (first-block-wins), the envelope is the
only fenced JSON block expected on that turn. The summary belongs only
on the artifact-complete turn.
```

**Acceptance tests (from structure.md slice 4 verification):**

```sh
# 1. Zero AskUserQuestion references in the agent file
grep -c AskUserQuestion /Users/matthew/code/bostonaholic/team/agents/design-author.md
# Expect: 0

# 2. openQuestions envelope shape present + skill loaded in frontmatter
grep -n openQuestions /Users/matthew/code/bostonaholic/team/agents/design-author.md
grep -n agent-open-questions /Users/matthew/code/bostonaholic/team/agents/design-author.md

# 3. Dev hook check-registry-sync.mjs continues to pass on save
#    (it cross-checks `name:`; tools removal does not trigger it).

# 4. End-to-end smoke (manual, after slice 4 lands):
#    Run /team-design against an existing approved-research topic.
#    Expected: subagent's final tool result contains a fenced ```json block
#    with openQuestions; the orchestrator (slice 2) renders AskUserQuestion;
#    after answers, the subagent writes design.md with no caveat block.
```

**Commit:** `feat(agents): migrate design-author to agent-open-questions envelope`

---

### Slice 5: Migrate questioner onto the envelope

**Order:** 5 of 6.

**Dependencies:** slices 1 and 2 committed.

**File operations:**

- `Edit` `/Users/matthew/code/bostonaholic/team/agents/questioner.md` — three edits described below.

**Pre-edit grep:**

```sh
grep -n '^tools:' /Users/matthew/code/bostonaholic/team/agents/questioner.md
grep -n '^skills:' /Users/matthew/code/bostonaholic/team/agents/questioner.md
grep -n 'If you suspect multi-repo' /Users/matthew/code/bostonaholic/team/agents/questioner.md
grep -n 'free-text `AskUserQuestion`' /Users/matthew/code/bostonaholic/team/agents/questioner.md
```

#### Edit 5a — tools frontmatter

**`Edit`** `old_string`:

```
tools: Read, Write, Grep, Glob, Bash, AskUserQuestion
```

**`new_string`:**

```
tools: Read, Write, Grep, Glob, Bash
```

#### Edit 5b — skills frontmatter (add agent-open-questions)

**`Edit`** `old_string`:

```
skills:
  - product-thinking
---
```

**`new_string`:**

```
skills:
  - product-thinking
  - agent-open-questions
---
```

#### Edit 5c — rewrite the multi-repo block (lines 198–210)

**`Edit`** `old_string` (verbatim block from the current file):

```
If you suspect multi-repo, ask the user via `AskUserQuestion` before
writing any artifacts. Use a single question with a `Repos` header and
two options:

- **Single repo (Recommended if unsure)** — the work happens entirely in
  the current repo.
- **Multi-repo** — the work spans the current repo and one or more
  others; the user will provide the additional paths.

If the user picks **Multi-repo**, follow up with a free-text
`AskUserQuestion` for the absolute paths and short slug names of each
additional repo. Validate each path exists and is a git working tree
(`git -C <path> rev-parse --git-dir`).
```

**`new_string`:**

````
If you suspect multi-repo, surface the question via the
agent-open-questions envelope before writing any artifacts. Load
`skills/agent-open-questions/SKILL.md` (preloaded via the `skills:`
frontmatter — read it if it isn't already in context). **Do not call
`AskUserQuestion` yourself.** Emit a single-question envelope as your
final assistant message and STOP; the orchestrator parses it, renders
`AskUserQuestion` on your behalf, and resumes you via
`SendMessage(to: <agentId>, message: <user selections>)`.

The envelope shape (single label-only question with header `Repos` and
two options):

```json
{
  "openQuestions": [
    {
      "question": "Does this topic span more than one repository?",
      "header": "Repos",
      "options": [
        { "label": "Single repo (Recommended if unsure)", "description": "The work happens entirely in the current repo." },
        { "label": "Multi-repo",                          "description": "The work spans the current repo and one or more others. If you pick this, the orchestrator will follow up with a plain-text question asking for each additional repo's slug and absolute path." }
      ]
    }
  ]
}
```

This is the **canonical worked example of the free-text escape hatch**
documented in `skills/agent-open-questions/SKILL.md`: because
`AskUserQuestion` returns only the chosen `label` and not a free-text
field, the **Multi-repo** option's `description` declares that the
orchestrator will follow up with a plain-text question for repo paths
and slugs.

Path-and-slug collection is an **orchestrator responsibility**, not
yours. If the user picks **Multi-repo**, the orchestrator asks a
plain-text follow-up requesting one entry per line in the format
`<slug>: <absolute-path>`, validates each path with `git -C <path>
rev-parse --git-dir`, and `SendMessage`s the validated list (or any
validation errors) back to you as the resume payload.

On resume:

- If the orchestrator returns **Single repo**, proceed in single-repo
  mode and do not write `repos.md`.
- If the orchestrator returns **Multi-repo** with a validated list of
  `<slug>: <absolute-path>` pairs, write `repos.md` from that list per
  the schema in `skills/qrspi-workflow/SKILL.md`.
- If the orchestrator returns validation errors instead, either
  re-emit the envelope (e.g. ask the user to confirm Single vs Multi
  again) or follow your existing error-handling guidance to surface the
  blocker.
````

**Acceptance tests (from structure.md slice 5 verification):**

```sh
# 1. Zero AskUserQuestion references
grep -c AskUserQuestion /Users/matthew/code/bostonaholic/team/agents/questioner.md
# Expect: 0

# 2. openQuestions envelope example present
grep -n openQuestions /Users/matthew/code/bostonaholic/team/agents/questioner.md

# 3. Skill load present
grep -n agent-open-questions /Users/matthew/code/bostonaholic/team/agents/questioner.md

# 4. Path-format string present
grep -n '<slug>: <absolute-path>' /Users/matthew/code/bostonaholic/team/agents/questioner.md

# 5. End-to-end smoke (manual):
#    Run /team with a multi-repo description (e.g. "wire the `web` app and the `api` service").
#    Expected: questioner emits a `Repos`-header envelope; orchestrator renders it
#    via AskUserQuestion; on Multi-repo, orchestrator asks for paths as plain-text
#    follow-up; orchestrator parses the response into a validated list and
#    SendMessages it back to the questioner; repos.md is written.
```

**Commit:** `feat(agents): migrate questioner to agent-open-questions envelope`

---

### Slice 6: Update plugin metadata

**Order:** 6 of 6.

**Dependencies:** slice 1 committed (the skill that bumps the count
must exist). Slices 2–5 do not block this slice but should be in place
before merge so the bump matches a working set.

**File operations:**

- `Edit` `/Users/matthew/code/bostonaholic/team/CLAUDE.md` — change the Skills heading from 27 to 28.

**Pre-edit grep (anchor):**

```sh
grep -n '^## Skills' /Users/matthew/code/bostonaholic/team/CLAUDE.md
# Expected: one match — `## Skills (27)` around line 64.
```

**`Edit`** `old_string` (anchors using the line immediately above and
the heading itself to guarantee uniqueness across the file):

```
## Skills (27)
```

**`new_string`:**

```
## Skills (28)
```

The surrounding context for confirmation (the line above is
`enforces this automatically.` and the line below is
`See `skills/*/SKILL.md`. Entry point skills double as slash
commands. Methodology skills are loaded by agents. ...`). The heading
string `## Skills (27)` is unique in the file (other headings reference
`Skills` only as part of `### Skill` patterns inside fenced tables);
the bare `Edit` is safe.

**Acceptance tests (from structure.md slice 6 verification):**

```sh
# 1. New heading present
grep -c '^## Skills (28)$' /Users/matthew/code/bostonaholic/team/CLAUDE.md
# Expect: 1

# 2. Old heading gone
grep -c '^## Skills (27)$' /Users/matthew/code/bostonaholic/team/CLAUDE.md
# Expect: 0
```

**Commit:** `chore(docs): bump skills count to 28`

---

## Done Criteria

- All six slices committed in order, each commit atomic.
- Every slice's acceptance tests pass (grep counts and manual smoke
  tests as listed above).
- No regressions:
  - `hooks/post-write-validate.mjs` continues to pass on every edited
    SKILL.md and agent .md (it checks frontmatter shape).
  - `.claude/hooks/check-registry-sync.mjs` continues to pass (it
    cross-checks `name:` only; `tools:` removal does not trigger it).
- End-to-end (post-slice 6):
  1. `/team-design` on a fresh topic produces a `design.md` with **no
     prose caveat block** about `AskUserQuestion` being "unavailable
     inside subagents."
  2. `/team` on a multi-repo description produces a structured
     `AskUserQuestion` for `Repos`, a plain-text follow-up for paths
     when Multi-repo is chosen, and a correctly populated `repos.md`.
  3. Zero `AskUserQuestion` references remain in `agents/design-author.md`
     and `agents/questioner.md` (verified by grep counts in slices 4
     and 5).
- Skill count in `CLAUDE.md` matches the actual count of
  `skills/*/SKILL.md` files (28 after slice 1 adds one).
