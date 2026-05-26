---
name: review-aggregation
description: Cross-reviewer synthesis methodology — fuzzy-match findings, derive corroboration counts, decouple severity from confidence, preserve hard-gate verdicts verbatim.
---

# Review Aggregation

The aggregator reconciles findings across the IMPLEMENT-phase reviewer
fan-out and emits a single ranked synthesis. This skill defines the
algorithm; `agents/review-aggregator.md` is the agent that runs it.

The aggregator is the **only** structured-synthesis layer in the
pipeline. The orchestrator's hard-gate evaluation (step 8 of
`skills/team-implement/SKILL.md`) still reads verdict tokens directly,
not the aggregator's confidence tags. See the "Aggregating Verdicts"
section of `skills/code-review/SKILL.md` for the hard-gate contract —
this skill preserves those verdicts verbatim and never aggregates them
away.

## Inputs

Two heterogeneous input streams:

1. **Artifact reviewers** — every `*.md` file under
   `docs/plans/<id>/reviews/`. Today these are:
   - `external-reviewer-codex.md`
   - `external-reviewer-gemini.md`
   - (any future reviewer that adopts artifact-first writes)

2. **Claude reviewer transcripts** — the 5 existing Claude reviewers
   (`code-reviewer`, `security-reviewer`, `technical-writer`,
   `ux-reviewer`, `verifier`) continue to emit through subagent
   transcripts in this change. The orchestrator forwards their
   verdict-bearing transcripts to the aggregator's prompt. Migrating
   them to artifact-first is explicitly **Out of scope** (see
   `docs/plans/team-bvc-multi-model-adversarial-review/design.md`).

## Normalization

Every finding is rewritten into Conventional Comments per
`skills/code-review/SKILL.md:70-79`. Each normalized finding carries:

- `file:line` — the location reference. Use literal `file: unknown` when
  the source emitted no location.
- `kind` — `issue` | `suggestion` | `nitpick`.
- `severity` — `CRITICAL` | `HIGH` | `MEDIUM` | `LOW` (preserve the
  reviewer's classification; see `skills/code-review/SKILL.md:81-89`).
- `summary` — one-sentence description.
- `originating_reviewer` — the reviewer name (e.g. `security-reviewer`,
  `external-reviewer-codex`).

## Fuzzy matching

Two findings **corroborate** when BOTH conditions hold:

1. Same `file:line` exactly (`file:unknown` never matches anything).
2. Jaccard keyword overlap on summary tokens ≥ 3 shared content words
   (case-folded; stopwords stripped — `a`, `an`, `the`, `is`, `of`,
   `in`, `to`, `for`, `on`, `at`, `and`, `or`).

When two findings at the same `file:line` have different `kind`, they
collapse to a single finding at the most-severe kind. Severity order:
`issue` > `suggestion` > `nitpick`.

Threshold calibration (the `≥ 3` value above) is a known follow-up
question per design *Open questions*. Treat it as the current default;
re-evaluate after the first real run.

### Worked example — corroboration merge

Two reviewers flag the same file:line with overlapping summaries.
Inputs:

```
# code-reviewer.md
**issue (blocking):** userInput dereferenced without null guard
file: src/api/users.ts:42
**Verdict:** REQUEST CHANGES

# security-reviewer.md
**issue (blocking):** missing null check on userInput could panic the handler
file: src/api/users.ts:42
**Verdict:** FAIL
```

The aggregator detects the matching `file:line` and the keyword
overlap (`userInput`, `null`, `check`/`guard`) ≥ 3 — both conditions
hold, so the findings merge. The synthesis emits a single entry:

```
---
**issue (blocking):** userInput dereferenced without null guard
file: src/api/users.ts:42
originating: code-reviewer, security-reviewer
corroborated by 2/N
```

Where `N` is the count of non-SKIP reviewers in the round (e.g. `5`
if the 2 externals SKIP'd and all 5 Claude reviewers returned). The
two underlying Claude hard-gate verdicts (`REQUEST CHANGES` and
`FAIL`) remain preserved verbatim in the verdict-token portion of
the synthesis — the merge is a display-layer deduplication, never a
verdict downgrade.

## Confidence

`corroborated by N/M` where:

- **N** = the count of reviewers flagging this finding.
- **M** = the count of reviewers that returned a **non-SKIP** verdict
  in the round.

When `N == 1`, tag the finding `[single-model — extra scrutiny]`.

**SKIP / PARTIAL semantics:**

- A SKIP artifact surfaces in the `Reviewers consulted:` header but
  never counts toward corroboration counts (neither N nor M).
- A PARTIAL artifact contributes findings (they appear in the
  synthesis) but its verdict does not count toward corroboration of
  passes.

## Header

Every synthesis opens with a `Reviewers consulted:` header of the
form:

```
Reviewers consulted: <claude_count> Claude + <ext_pass>/<ext_total> external (codex: <verdict_or_skip_reason>, gemini: <verdict_or_skip_reason>)
```

`<ext_pass>` is the number of external reviewers whose verdict was NOT
SKIP. `<ext_total>` is the total external reviewer count for the round
(today: 2).

The header makes silent SKIP fatigue visible — if a CLI is installed
but always SKIPs (auth misconfigured), the user sees the SKIP reason
on every run.

## Malformed-input handling

A finding with `file: unknown` (the CLI emitted no `file:line`) is
included verbatim in the synthesis and **never** matched against any
other finding. It also never carries a `corroborated by` tag because
there is no addressable location to match against.

## Hard-gate preservation

This is non-negotiable. The aggregator MUST emit any Claude hard-gate
verdict (`FAIL` from `security-reviewer` or `verifier`,
`REQUEST CHANGES` from `code-reviewer`) verbatim, with its severity
unchanged and NO confidence-based downgrade.

Per `skills/code-review/SKILL.md:156`: *"hard gate failures are never
aggregated away."*

Confidence (`corroborated by N/M`, `[single-model — extra scrutiny]`)
is a **display annotation**. The orchestrator's hard-gate evaluation at
step 8 of `skills/team-implement/SKILL.md` reads the verdict token,
NOT the confidence tag. A single-model `security-reviewer` CRITICAL
must still trigger the hard gate.

## Output shape

The synthesis is a markdown document with this skeleton:

```
## Review Aggregation

Reviewers consulted: <claude_count> Claude + <ext_pass>/<ext_total> external (codex: ..., gemini: ...)

- <reviewer>: <verdict>
- <reviewer>: <verdict>
...

## Findings

---
**issue (blocking):** <summary>
file: <path>:<line>
originating: <reviewer>
corroborated by N/M | [single-model — extra scrutiny]

(further findings...)

**Verdict:** PASS | FAIL | SKIP | PARTIAL
```

The verdict line on the last line MUST match the contract from
`agents/security-reviewer.md:115` so prose-only verdict scanners
(including the orchestrator at step 8) continue to work.
