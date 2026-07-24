---
name: authoring-designs
description: Design-document authoring procedure for the design-author agent — the repo-scope confirmation flow, the mandatory interactive open-questions step, and the design.md document template. Loaded when a design document is drafted or revised for the human gate.
user-invocable: false
---

# Authoring Designs

The design-author's procedure: confirm repo scope, present open questions
to the user before drafting, and write `design.md` from the template below.

Write the prose in `design.md` in ASD-STE100 Simplified Technical
English — short sentences, common words, one instruction per sentence,
one meaning per word. Full methodology: `skills/writing-prose/SKILL.md`.

If `task.md` references a `prd.md`, read it first and treat its scope
boundaries and acceptance criteria per the "Consuming a PRD downstream"
section of `skills/product-requirements-doc/SKILL.md`.

## Confirm repo scope (before drafting)

If `docs/plans/<id>/repos.md` is **present**, read it and treat the
listed repos as the working assumption. The design must respect that
scope — note in `## Decisions made` which repos each decision touches
and why.

If `repos.md` is **absent**, scan `research.md` for signals that the
work plausibly spans more than one repo (cross-service contracts,
shared schemas, references to "the other repo"). When you see such
signals, raise the question via the open-questions envelope in your
interactive step (see below) — header `Repos`, options:

- **Single repo (Recommended unless clearly multi-repo)** — keep all
  work in the current repo.
- **Multi-repo** — list the additional repos; the user provides paths.

If the user picks **Multi-repo**, write `docs/plans/<id>/repos.md`
yourself (schema in `skills/qrspi-workflow/SKILL.md`) before continuing
the design. If they pick **Single repo**, do not write `repos.md`.

Never silently expand scope across repos. The design either ships
single-repo or it asks first.

## MANDATORY interactive step

Before writing the design document, you MUST present open questions to the
user and wait for answers. Do not draft the design first and then ask.
Surface the questions via the envelope protocol in
`skills/agent-open-questions/SKILL.md` — emit the `openQuestions` envelope,
STOP, and wait for the orchestrator to resume you with the user's
selections. **Do not write `design.md` on the envelope turn** — the
artifact is written only on the post-resume turn, after the orchestrator
has supplied the user's answers.

Present at most 4 sharp questions in a single envelope (the orchestrator's
multi-choice prompt accepts 1–4 questions per call). If you have more
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

After the orchestrator resumes you with the user's selections (a new user
turn carrying the chosen labels verbatim), incorporate the answers into
`## Decisions made` in the design. Reference each chosen option by its
label so the trade-off the user accepted is auditable.

On a revision dispatch, skip the envelope unless the user's feedback
raises new ambiguities — in that case, emit a fresh envelope per the same
protocol before re-drafting.

## Design document structure

```markdown
# Design: <topic>

## Current state
<2-4 paragraphs describing how the relevant subsystem works today, citing
specific files and functions from research.md>

## Desired end state
<2-4 paragraphs describing how it will work after this change, with the
same level of file-level specificity>

## Patterns to follow
<bulleted list of existing patterns the implementation will mirror, with
file:line references. This is your chance to call out the GOOD patterns
in the codebase so the implementer does not pick the wrong precedent.>

## Decisions made
<numbered list of design decisions, each with: the decision, the alternative
considered, why this was chosen. Reference user answers from the open-
questions phase here.>

## Out of scope
<bulleted list of things this design explicitly does NOT do. Be specific —
"error handling" is not out of scope, "rate limiting on the public API" is.>

## Edge cases
<bulleted list of boundary conditions, error paths, and unusual inputs the
design must handle. Each item names the scenario AND the chosen behavior.
Walk these categories explicitly so none gets skipped:
- **Boundary values:** empty, zero, one, max-size, off-by-one.
- **Invalid inputs:** malformed payloads, wrong types, missing fields.
- **Failure paths:** downstream errors, timeouts, partial writes, retries.
- **Concurrency:** simultaneous requests, idempotency, races.
- **Authorization:** unauthenticated, unauthorized, expired credentials.
- **Resource limits:** rate exhaustion, quota, memory pressure.
Edge cases that are intentionally deferred belong in `## Out of scope`,
not here — so structure and tests do not silently expand into them.>

## Open questions (deferred)
<low-priority questions parked for the structure or implement phase>

## Risks
<known risks: backward compatibility, performance, data migration,
operational concerns. One bullet each.>
```

## Rules

- **No implementation code.** No function bodies, no full type definitions.
  Type signatures are OK if they crystallize a decision.
- **Reference patterns, do not duplicate them.** "Follow the pattern in
  `lib/foo.ts:30-60`" is better than restating those 30 lines.
