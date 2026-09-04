---
name: authoring-designs
description: 'Defines the design-document procedure. Load when drafting or revising `6-design.md` for adversarial review.'
user-invocable: false
---

# Authoring Designs

The design-author's procedure: confirm repo scope, resolve open questions
autonomously as recorded assumptions, and write `6-design.md` from the
template below.

Write the prose this skill governs at a seventh-grade reading level, in
STE-flavored mode — short sentences, common words, no unexplained jargon.
Full methodology: `writing-prose`. Before
you finalize prose this skill governs, call the Skill tool with
`writing-prose` and apply its `## Self-lint` checklist.

If `1-task.md` references a `3-prd.md`, read it first and treat its scope
boundaries and acceptance criteria per the "Consuming a PRD downstream"
section of `skills/product-requirements-doc/SKILL.md`.

## Confirm repo scope (before drafting)

If `docs/plans/<id>/4-repos.md` is **present**, read it and treat the
listed repos as the working assumption. The design must respect that
scope — note in `## Decisions made` which repos each decision touches
and why.

If `4-repos.md` is **absent**, scan `5-research.md` for signals that the
work plausibly spans more than one repo (cross-service contracts, shared
schemas, references to "the other repo"). When you see such signals,
resolve each candidate repo autonomously through the sibling directories
of the home repo root. First
**validate every candidate `<name>` against a strict allowlist**: the
name must match `^[A-Za-z0-9._-]+$` and must not be exactly `.` or `..`.
Anything else — path separators, absolute paths, traversal sequences,
shell metacharacters — fails the allowlist and is unresolvable. A
surviving repo named `<name>` is expected at `<root>/../<name>`. Make
sure that the sibling path exists and is a git working tree (check for
its `.git` entry — you have no Bash tool, so use Glob/Read. The
questioner's check is `git -C <path> rev-parse --git-dir`). Never record
a `4-repos.md` path outside the home repo's parent directory. If you
cannot verify the resolved path is a direct child of that directory,
treat the candidate as unresolvable.

- **All candidates resolve** → write `docs/plans/<id>/4-repos.md`
  yourself (schema in `skills/artifact-frontmatter/SKILL.md`) before
  continuing the design.
- **Any candidate is unresolvable** → proceed in single-repo mode and
  record the omission **loudly** in `## Risks`: name the unresolvable
  repo and the work that is thus excluded from scope.

Never silently expand scope across repos. The design either ships
single-repo with the omission recorded, or lists only repos it actually
resolved.

## Resolve open questions autonomously

You never pause for user input. Resolve each open design choice yourself
per `principle-record-assumptions`: record it in
`## Decisions made` marked "Assumption — chosen without user review", and
park low-stakes items in `## Open questions (deferred)`.

On a revision dispatch, address the reviewer's findings verbatim in the
re-draft, recording any newly resolved choice the same way.

## Design document structure

```markdown
# Design: <topic>

## Current state
<2-4 paragraphs describing how the relevant subsystem works today, citing
specific files and functions from 5-research.md — including the
adjacent components (callers, consumers, and sibling implementations), not
only the component being changed>

## Desired end state
<2-4 paragraphs describing how it will work after this change, with the
same level of file-level specificity.

Include a bulleted list of boundary conditions, error paths, and unusual
inputs the design must handle. Each item names the scenario AND the chosen
behavior. Walk these categories explicitly so none gets skipped:
- **Boundary values:** empty, zero, one, max-size, off-by-one.
- **Invalid inputs:** malformed payloads, wrong types, missing fields.
- **Failure paths:** downstream errors, timeouts, partial writes, retries.
- **Concurrency:** simultaneous requests, idempotency, races.
- **Authorization:** unauthenticated, unauthorized, expired credentials.
- **Resource limits:** rate exhaustion, quota, memory pressure.
Edge cases that are intentionally deferred belong in `## Out of scope`,
so structure and tests do not silently expand into them.>

## Patterns to follow
<bulleted list of existing patterns the implementation will mirror, with
file:line references. This is your chance to call out the GOOD patterns
in the codebase so the implementer does not pick the wrong precedent.>

## Decisions made
<numbered list of design decisions, each with: the decision, the alternative
considered, why this was chosen. Name the surfaces that must change together
(callers, siblings, config, docs). Every set a decision declares closed — the
surfaces a rule reaches, the members of a class, a blast radius, an
inventory — is derived by enumeration (a grep, a directory listing, a
key-set comparison) and the command that produced it is recorded beside the
list, so a reviewer re-runs it instead of trusting it; a set listed from
memory is the single most common REQUEST CHANGES cause. Mark every
self-resolved choice "Assumption — chosen without user review" here.>

## Out of scope
<bulleted list of things this design explicitly does NOT do. Be specific —
"error handling" is not out of scope, "rate limiting on the public API" is.>

## Surfaces
<Include this section ONLY when the design defines more than one way in:
two entry modes, a self-contained path that can be loaded alone, a split
across turns, or any procedure a reader can arrive at without reading the
rest. A single-path design omits the section entirely.

List the surfaces, then give one row per rule or safeguard the design
introduces, marking which surfaces it reaches:

| Safeguard | Mode A | Mode B | ... |
|-----------|--------|--------|-----|
| <rule>    | yes    | yes    |     |
| <rule>    | yes    | no — <why not> | |

Every `no` states its reason. An omission with no reason is the defect this
section exists to surface: a rule stated once, in the surface its author
happened to be editing, while a reader arriving through the other one is
governed by nothing. Where a surface claims to be self-contained, that claim
is itself a safeguard — say what makes it true.>

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
- **Apply the systems-thinking lens** — if it is not already in context,
  call the Skill tool with `systems-thinking` and
  use its `## When Designing` section: document adjacent components in
  `## Current state` and name the surfaces that must change together in
  `## Decisions made`. Adds no new gate.
- **Existing rationale is a design constraint.** When the design reshapes
  or removes long-standing code — a guard, a threshold, an ownership or
  layering boundary that looks deliberate — its original motivation
  belongs in `## Decisions made` as a constraint, not a guess. The
  standalone `skills/why/SKILL.md` utility is the archaeology procedure
  for recovering it (its Preserve / Change / Avoid / Risk output maps
  directly onto a decision record), and `skills/how/SKILL.md` describes
  the explanation shape `## Current state` wants. Both are citations for
  depth, not steps in this procedure — `5-research.md` remains the default
  source.
