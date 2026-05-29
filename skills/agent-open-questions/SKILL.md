---
name: agent-open-questions
description: Protocol a subagent uses to surface open questions to the user. Emit a fenced JSON envelope as the final assistant message and STOP; the orchestrator renders AskUserQuestion and resumes via SendMessage with the user's selections. Load this skill from any agent whose prompt has an interactive step.
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

## The envelope shape

The subagent's **final assistant message** ends with a fenced JSON
block whose top-level object carries an envelope array. Each item
mirrors the shape `AskUserQuestion` itself accepts: `question`,
`header`, and `options` (each option carries `label` and
`description`).

Example envelope:

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
proceed to write its artifact. Do not emit an empty envelope with an
empty array — the orchestrator treats the absence of an envelope as
"nothing to render."

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

## Orchestrator parse rule (Decision 5: first-block-wins)

The orchestrator scans the subagent's final tool result for fenced
```` ```json ```` blocks in order. The **first** block whose top-level
object contains an `openQuestions` array is the envelope. Other fenced
JSON blocks (such as a subagent's summary return at the very end of an
artifact-complete message) are ignored when an envelope is present.
Subagents MUST NOT include that key in their summary returns.

## Reference implementations

- `agents/design-author.md` — DESIGN phase open questions.
- `agents/questioner.md` — multi-repo disambiguation, including the
  free-text escape hatch for path collection.
