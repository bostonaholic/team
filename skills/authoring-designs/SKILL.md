---
name: authoring-designs
description: Design-document authoring procedure for the design-author agent — the repo-scope confirmation flow, the autonomous open-questions resolution rule, and the design.md document template. Loaded when a design document is drafted or revised for the adversarial design review.
user-invocable: false
---

# Authoring Designs

The design-author's procedure: confirm repo scope, resolve open questions
autonomously as recorded assumptions, and write `design.md` from the
template below.

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
signals, resolve each candidate repo autonomously via the sibling
directories of the home repo root. First **validate every candidate
`<name>` against a strict allowlist**: the name must match
`^[A-Za-z0-9._-]+$` and must not be exactly `.` or `..`. Anything
else — path separators, absolute paths, traversal sequences, shell
metacharacters — fails the allowlist and is unresolvable. A surviving
repo named `<name>` is expected at `<root>/../<name>`. Confirm the
sibling path exists and is a git working tree (check for its `.git`
entry — you have no Bash tool, so use Glob/Read; the questioner's check
is `git -C <path> rev-parse --git-dir`). Never record a `repos.md` path
outside the home repo's parent directory; if you cannot verify the
resolved path is a direct child of that directory, treat the candidate
as unresolvable.

- **All candidates resolve** → write `docs/plans/<id>/repos.md`
  yourself (schema in `skills/artifact-frontmatter/SKILL.md`) before
  continuing the design.
- **Any candidate is unresolvable** → proceed in single-repo mode and
  record the omission **loudly** in `## Risks`: name the unresolvable
  repo and the work that is therefore excluded from scope.

Never silently expand scope across repos. The design either ships
single-repo with the omission recorded, or lists only repos it actually
resolved.

## Resolve open questions autonomously

You never pause for user input. When the task and research artifacts
leave a genuine design choice open, resolve it yourself: pick the
option you would have recommended, and record it in `## Decisions made`
marked "Assumption — chosen without user review", naming the rejected
alternative and the trade-off accepted. The human audits these
assumptions at PR review — an unmarked guess is a defect.

Park low-stakes items in `## Open questions (deferred)` rather than
inflating the decision list; deferral is itself a recorded choice.

On a revision dispatch, address the reviewer's findings verbatim in the
re-draft, recording any newly resolved choice the same way.

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
considered, why this was chosen. Mark every self-resolved choice
"Assumption — chosen without user review" here.>

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
