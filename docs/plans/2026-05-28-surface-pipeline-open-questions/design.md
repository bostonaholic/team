---
topic: surface-pipeline-open-questions
date: 2026-05-28
phase: design
approved: true
approved_at: 2026-05-29T03:17:55Z
revision: 1
---

# Design: surface-pipeline-open-questions

## Current state

Two of the 13 pipeline agents declare `AskUserQuestion` in their `tools:`
frontmatter: `agents/questioner.md:6` and `agents/design-author.md:6`. Both
prompts contain hard, "MANDATORY"/"MUST"-phrased instructions to call the
tool — `agents/design-author.md:91-106` for the design's pre-draft
interactive step, and `agents/questioner.md:196-213` for multi-repo
disambiguation.

In practice, those subagent calls do not reliably surface to the user. The
reported symptom is that `design-author` instead emits a prose caveat block
at the top of every `design.md` rationalizing why the tool "is unavailable
inside subagents," and presents its open questions as a static list with
recommended options. The `questioner` exhibits the same failure: during the
pipeline run that produced this very topic, it emitted a markdown question
list instead of calling the tool, and the orchestrator had to render the
questions on its behalf.

Research (`docs/plans/<id>/research.md` Q3–Q4, Q7) confirms there is no
documented contract for how subagent tool calls reach the user, no
fallback behavior defined anywhere, and no precedent of a subagent
successfully running an interactive flow. The only reliably-working
`AskUserQuestion` sites are orchestrator-level: `skills/team/SKILL.md:131-136`
(design gate), `skills/team/SKILL.md:145-147` (structure gate), and
`skills/team/SKILL.md:210-212` plus `skills/team-pr/SKILL.md:103-111`
(PR shipping options). The canonical-tool passage at
`skills/team/SKILL.md:236-240` establishes `AskUserQuestion` as the
orchestrator's tool but never addresses subagent use.

The root cause is structural, not prompt-strength: the agents are told to
call a tool whose user-visibility from inside a subagent is undefined.
With no defined fallback, the agent invents one — the prose caveat block.

## Desired end state

Subagents do not call `AskUserQuestion` themselves. Instead, when a
subagent has open questions the user must resolve, it **returns the
questions to the orchestrator** in a structured envelope as its final
message text. The orchestrator parses the envelope, calls
`AskUserQuestion` (which it already does at three documented sites), and
resumes the same subagent via the Task tool's `SendMessage(to: <agentId>,
message: ...)` mechanism. The subagent receives the user's selections as
a new user turn with its full prior transcript intact — it is not a
fresh dispatch with a re-built prompt.

This resume-via-`SendMessage` pattern is the working precedent from this
very pipeline run: both the questioner and design-author agents emitted
question payloads, the orchestrator rendered them via `AskUserQuestion`,
and resumed each agent with the user's selections to complete the
artifact. The design promotes that ad-hoc protocol to a documented
contract.

Three concrete artifacts realize this:

1. **A new shared skill** at `skills/agent-open-questions/SKILL.md`
   becomes the single source of truth for the protocol. It defines the
   JSON envelope shape, the `SendMessage(to: agentId, ...)` resume
   contract, the parse rule (see Decision 5), and the "do not call
   `AskUserQuestion` from inside a subagent" rule. Every agent that
   needs interactive input references it.

2. **The JSON envelope** is a fenced ```` ```json ```` block in the
   subagent's final assistant message, with a top-level `openQuestions`
   key, mirroring the array shape `AskUserQuestion` itself accepts
   (each item: `question`, `header`, `options[{label, description}]`).
   The Task tool returns that final message text as the tool result;
   the orchestrator scans for the envelope, parses it, calls
   `AskUserQuestion` with the parsed array, and resumes the subagent
   via `SendMessage(to: agentId, message: <user selections verbatim>)`.

3. **The `tools:` frontmatter of `design-author` and `questioner` no
   longer declares `AskUserQuestion`.** The declaration is misleading:
   the tool is wired in but the agent should not call it. Removing it
   makes the contract clear and eliminates the cognitive dissonance
   that produces the caveat block.

The interactive sections of `agents/design-author.md` and
`agents/questioner.md` are rewritten to point at the new skill,
describe the JSON envelope, and instruct the agent to STOP after
emitting it (no artifact writes until the orchestrator resumes with
answers). The prose caveat block is gone — replaced by the protocol
itself.

## Patterns to follow

- **Orchestrator-side resume via Task tool:** the orchestrator
  receives the subagent's final assistant text as the Task tool
  result, parses the fenced JSON envelope, calls `AskUserQuestion`,
  and resumes the same subagent with `SendMessage(to: <agentId>,
  message: <user selections verbatim>)`. This is the same pattern
  used live in this pipeline run to resume the questioner and the
  design-author after their initial envelopes.
- **Orchestrator-side `AskUserQuestion` rendering:** mirror the
  three-option shape used at `skills/team/SKILL.md:131-136` (design
  approval) and `skills/team-pr/SKILL.md:103-111` (ship options).
  The orchestrator passes the parsed array through unchanged.
- **Agent-loaded skill convention:** the new skill follows the same
  pattern as `skills/qrspi-workflow/SKILL.md` and
  `skills/code-review/SKILL.md` — a methodology skill loaded by
  agents via prompt reference, not a slash-command entry point. Add
  it to the count in the project `CLAUDE.md` skills line (27 → 28).
- **Cross-link from qrspi-workflow:** the structure phase adds a
  one-line pointer to `skills/qrspi-workflow/SKILL.md` next to its
  existing "surface as an open question" language
  (`skills/qrspi-workflow/SKILL.md:215-216`), citing the new skill as
  the canonical mechanism. This keeps the 11 unmigrated agents
  pointed at the same contract without changing their prompts.
- **Structured subagent return values:** existing agents already
  return small JSON summaries (e.g. `{designPath, id,
  openQuestionsResolved: N}` at `agents/design-author.md:221-223`).
  The open-questions envelope reuses that same "fenced JSON in the
  final message" convention; the parse rule (Decision 5)
  disambiguates the two.
- **MUST/MANDATORY phrasing:** the rewritten interactive-step
  sections keep the existing imperative style
  (`agents/design-author.md:91-95`, `:189-191`) but redirect what is
  mandated — emit the envelope, do not call the tool.

## Decisions made

1. **Protocol home: New shared skill (Recommended)** — create
   `skills/agent-open-questions/SKILL.md`. Each agent that needs the
   protocol references it from its prompt. Alternative considered:
   inlining the protocol into `skills/qrspi-workflow/SKILL.md`.
   Rejected because the workflow skill is about pipeline discipline
   and artifacts; a tool-interaction contract is a separate concern
   and will be loaded by agents that have no other reason to read
   the workflow skill.
2. **Envelope: Fenced JSON block with `openQuestions` key
   (Recommended)** — subagent emits a ```` ```json ```` fenced block
   containing `{"openQuestions": [...]}`. Alternative considered: a
   bare JSON object with no surrounding text. Rejected because
   subagents reliably emit framing prose around structured returns;
   the fenced-block convention is robust to that and matches what is
   already done.
3. **Tools field: Remove from both (Recommended)** — drop
   `AskUserQuestion` from the `tools:` line in
   `agents/design-author.md:6` and `agents/questioner.md:6`.
   Alternative considered: leaving the tool declared but instructing
   agents never to call it. Rejected because that is exactly the
   configuration that produces the current bug.
4. **Migration: Only `design-author` + `questioner` (Recommended)** —
   wire the protocol into the two agents that have interactive steps
   today. Alternative considered: adding a brief "how to escalate
   ambiguity" pointer to all 13 agent prompts. Rejected because 11
   of those agents have no interactive step today. The shared skill,
   plus the one-line cross-link from `qrspi-workflow/SKILL.md` (see
   `## Patterns to follow`), is the discovery surface.
5. **Parse rule: first fenced `json` block with an `openQuestions`
   array wins.** The orchestrator scans the Task tool result for
   ```` ```json ```` fenced blocks in order; the first block whose
   top-level object contains an `openQuestions` array is the
   envelope. Other fenced JSON blocks (e.g. the `{designPath, ...}`
   summary return at the very end of a normal artifact-complete
   message) are ignored when the envelope is present. Alternative
   considered: last block wins. Rejected because subagents typically
   write framing prose before the structured block, and the
   "envelope first, summary last" ordering matches how the existing
   design-author summary appears at the end of the message.

The named user for this change is the human running `/team` on a new
feature. The demand signal is direct: they reported the caveat block as
a defect and asked for the questioner failure to be treated as a live
reproduction.

## Out of scope

- Updating the other 11 agents (`file-finder`, `researcher`,
  `structure-planner`, `planner`, `test-architect`, `implementer`,
  `verifier`, `code-reviewer`, `security-reviewer`, `ux-reviewer`,
  `technical-writer`). They adopt the protocol if and when they grow
  an interactive step. The cross-link from `qrspi-workflow/SKILL.md`
  is the discovery surface, not a migration.
- Any runtime hook that mechanically validates the envelope or
  blocks a subagent's `AskUserQuestion` call. The fix is contractual
  (prompts + skill), not enforced.
- Modifying Claude Code itself or the `AskUserQuestion` /
  `SendMessage` tool surfaces.
- Changes to the orchestrator's three existing `AskUserQuestion`
  sites (design gate, structure gate, PR ship). They continue to
  work as they do today.
- Backfilling the protocol into in-flight topics that already have a
  `design.md` produced by the old design-author behavior. Existing
  drafts stay as they are.
- A `repos.md` schema change. The questioner's multi-repo question
  is rewired to the new protocol but its content is unchanged.

## Edge cases

- **Boundary — zero open questions:** subagent has nothing to ask.
  It skips the envelope entirely and proceeds to write its artifact.
  No empty `openQuestions: []` envelope; the orchestrator treats
  absence as "nothing to render."
- **Boundary — one question:** envelope contains a single-element
  array. Orchestrator renders it via a single `AskUserQuestion`
  call.
- **Boundary — `AskUserQuestion` 4-question limit:** the tool
  accepts 1–4 questions per call. The skill caps subagent envelopes
  at 4. If a subagent emits 5+, the orchestrator renders the first
  4 and resumes the subagent (via `SendMessage`) with a note that
  the remainder must be re-emitted or deferred. The skill instructs
  subagents to split or defer up front rather than rely on this.
- **Invalid — malformed JSON, attempt 1:** orchestrator's parse step
  fails. It `SendMessage`s the subagent with the exact parse error
  verbatim and asks for a corrected envelope.
- **Invalid — malformed JSON, attempt 2:** on the second consecutive
  parse failure, the orchestrator (a) writes the raw tool result to
  `docs/plans/<id>/dispatch-failure.md` with frontmatter
  `phase: design, status: parse-failed`, (b) marks the phase halted
  in TodoWrite, (c) surfaces a clear message to the user naming the
  artifact path. The next `/team-design` invocation reads
  `dispatch-failure.md` and offers the user re-dispatch or manual
  recovery.
- **Invalid — fenced block missing the `openQuestions` key, or the
  value is not an array:** treated as "no envelope present" by the
  parse rule (Decision 5). If no other block carries the key, the
  orchestrator accepts whatever artifact the subagent wrote and
  moves on.
- **Invalid — option missing `label` or `description`:**
  orchestrator fills missing `description` with the empty string and
  renders; missing `label` is a parse failure (the user has nothing
  to click) and follows the two-attempt path above.
- **Invalid — subagent emits envelope AND summary JSON in the same
  message:** Decision 5 applies — the orchestrator picks the block
  with the `openQuestions` key. The summary is ignored on that turn;
  the subagent re-emits it after the resume.
- **Failure — orchestrator cannot find any fenced block in the tool
  result:** the orchestrator treats the dispatch as "no envelope,
  artifact-complete" and reads the artifact from disk (existing
  behavior). If the agent's prompt mandated an envelope and none
  arrived AND no artifact was written, the orchestrator falls back
  to the two-attempt parse-failure path above and writes
  `dispatch-failure.md`.
- **Failure — user cancels the `AskUserQuestion` prompt
  mid-flight:** orchestrator does not `SendMessage` the subagent,
  marks the phase halted in TodoWrite, and surfaces "user cancelled
  at <phase>." The next `/team-*` invocation resumes from the same
  phase via a fresh dispatch.
- **Failure — subagent emits envelope AND writes its artifact in
  the same turn:** harmless. Resume preserves the subagent's
  transcript, so the orchestrator renders the envelope and
  `SendMessage`s the user's selections; the agent revises or
  overwrites the artifact in its next turn with the answers
  incorporated. No discard step is needed.
- **Concurrency — questioner emits envelope before any artifact
  exists:** the multi-repo question fires before `task.md` /
  `questions.md` are written. Because resume is via `agentId` and
  not via re-dispatching from artifacts, no anchor is required: the
  orchestrator renders, `SendMessage`s the answer, and the
  questioner proceeds to write both artifacts with the multi-repo
  decision baked in.
- **Concurrency — parallel agents both want to ask questions:** the
  only parallel dispatch in the pipeline today is RESEARCH
  (`file-finder` + `researcher`), neither of which adopts the
  protocol in this change. Out of scope until a future agent needs
  it; the skill notes the limitation.
- **Concurrency — revision dispatch:** on a revision (human gate
  rejected the design), the subagent's prompt already instructs it
  to skip the interactive step unless the feedback raises new
  ambiguities. The new skill preserves that: the envelope is
  optional on revisions, and emitting it is allowed when truly
  needed. Resume still works the same way.
- **Authorization:** not applicable — orchestrator and subagents
  run in the same Claude Code session under the same user.
- **Resource limits — envelope exceeds reasonable size:** the skill
  caps the array at 4 questions and each `description` at ~200
  chars (matching existing examples). Beyond that, the agent should
  defer the lower-priority items to `## Open questions (deferred)`
  in its artifact.

## Open questions (deferred)

- Should the orchestrator's parse step live inline in
  `skills/team/SKILL.md` or in a small parser utility? Defer to the
  structure phase — depends on whether other phases need the same
  parser later.
- If `skills/agent-open-questions/SKILL.md` ends up under ~40
  lines, the structure phase may choose to inline it into
  `skills/qrspi-workflow/SKILL.md` as a sub-section instead. Defer
  the decision to structure.
- Exact wording of the "STOP after emitting the envelope"
  instruction in each agent prompt. Defer to implement — copy-edit,
  not design.

## Risks

- **Depends on undocumented Task-tool behavior.** The protocol
  relies on the Claude Code Task tool returning the subagent's
  final assistant message as the tool result, and on
  `SendMessage(to: agentId, ...)` resuming that subagent with
  transcript intact. Both are observable runtime behaviors (used
  live in this very pipeline run) but not documented as stable
  contracts by Claude Code. If either changes, the protocol breaks
  at the orchestrator parse step or the resume step. Mitigation:
  the `dispatch-failure.md` fallback path keeps the user in control
  if the contract drifts; the design does not assume silent
  recovery.
- **Back-compat with in-flight topics:** any topic whose
  `design.md` was produced under the old `design-author` carries
  the prose caveat block. Those drafts are unaffected by this
  change and remain consumable by the structure phase; the caveat
  is cosmetic in retrospect. No migration script is needed.
- **Registry-sync hook implications:** the dev hook at
  `.claude/hooks/check-registry-sync.mjs` only validates the `name`
  field cross-check (lines 38–52 parse only `name:`). Removing
  `AskUserQuestion` from `tools:` does not trigger any sync
  warning. Low risk.
- **Orchestrator parse drift:** the orchestrator's envelope-
  detection step is described in prose in `skills/team/SKILL.md`,
  not enforced by code. If a future edit to the skill loses the
  parse step, subagents that emit envelopes will get their JSON
  rendered to the user as text. Mitigation: the new skill cross-
  links to the exact section of `skills/team/SKILL.md` that
  documents the parse step.
- **Assumption standing in for demand:** we assume future agents
  will discover the shared skill via the `qrspi-workflow/SKILL.md`
  cross-link when they grow an interactive step. If they don't,
  they may reinvent prose-question blocks. The cross-link, the
  shared skill, and the worked examples in `design-author` /
  `questioner` are the signal pointing them at it. Acceptable risk
  given the migration scope decision (only two agents now).
