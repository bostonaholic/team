## Execution

### Step 1 — extract the claims

- **Claims in arguments or from a caller:** split them into atomic claims,
  one checkable assertion each. Keep the claimant's wording beside each
  split.
- **A PR:** extract every checklist item from its `## Test plan` section.
  Also recognize `## How to Verify`, which team-pr emits. If neither section
  exists, fall back to the verification criteria stated in the PR body.

No claims anywhere → report `nothing to prove` and stop (Hard Rule 7).

### Step 2 — sharpen each claim

For every claim, write its **criterion**: the observation that would prove it
false, and the observation that would prove it true. A claim too vague to
have one, such as "it's faster" or "the UX is better", is not guessed at.
Record it as UNPROVEN, say why, and give a sharpened version the claimant
could adopt, such as "p50 export time under 2s on the fixture dataset".

Output the numbered claims with their criteria before verifying anything
(Hard Rule 6).

### Step 3 — gather and judge

Pick each claim's strategy and rung from [Evidence](references/04-evidence.md). Run at
most 4 verifications in flight (Hard Rule 9). Look for the disproving
observation first. For each claim, record:

- the **claim** and its **criterion**
- the **method**: the strategy, the rung reached, and any delegate called
- the **evidence**: file paths, line numbers, command output, diff excerpts,
  or frame paths
- the **verdict**, from the table below
- the **confidence**, from the table below

| Verdict | Meaning |
|---|---|
| **PROVEN** | The evidence meets the criterion, and the search for a disproving observation found none |
| **PARTIAL** | The claim holds in part, or only with a nuance the claim does not state |
| **DISPROVEN** | The evidence shows the disproving observation |
| **UNPROVEN** | No evidence reached either way: out of reach, untrusted to execute, or too vague to test |

| Confidence | Meaning |
|---|---|
| **HIGH** | Evidence from the claim's own rung directly and unambiguously settles it |
| **MEDIUM** | The settling evidence comes from a lower rung, holds with a nuance, or concerns intent rather than current state |
| **LOW** | The evidence is ambiguous, contradictory, or indirect |

Method notes:

- **Filesystem claims:** run the actual command. Never infer from memory.
- **Content claims:** read the file and quote the relevant lines. Never
  paraphrase.
- **Diff claims:** use `git diff` or `git show`. Never rely on commit messages.
- **Structural claims:** glob all files and cross-reference against the
  expected list. Report both missing and extra entries.

### Step 4 — report

The first line is the overall verdict, applied mechanically. No judgment
call overrides a DISPROVEN:

- **`Verdict: PROVEN`**: every claim is PROVEN at HIGH or MEDIUM confidence.
- **`Verdict: NEEDS ATTENTION`**: no claim is DISPROVEN, but at least one is
  PARTIAL, UNPROVEN, or LOW confidence.
- **`Verdict: DISPROVEN`**: at least one claim is DISPROVEN. DISPROVEN always
  wins, even when other claims are PARTIAL or UNPROVEN.

For a PR, add the readiness reading on the next line: PROVEN reads as READY,
NEEDS ATTENTION as NEEDS ATTENTION, and DISPROVEN as NOT READY.

Then present a summary table and the detailed findings:

```
| # | Claim | Verdict | Confidence | Method | Key evidence |
|---|-------|---------|------------|--------|--------------|
```

The detailed findings give each claim's exact wording, its criterion, the
evidence collected, the confidence and its justification, and any nuances.
Name the scratch directory holding logs or frames, every delegate that was
unavailable, and every rung that was out of reach, each on its own line.

### Step 5 — follow-ups

For every PARTIAL, DISPROVEN, UNPROVEN, or LOW-confidence claim, suggest the
specific action that resolves it. Say which kind of action it needs: a code
fix, a doc clarification, a sharper claim, or manual testing. For a claim
that can't be proven here, such as "deploy works", say so and recommend how
the user can prove it by hand.

A `gh` rate-limit error is reported by name, with no silent retry loops.

`prove` ends with the report and its follow-ups. Fixing, landing, and
re-running checks belong to the caller or to other skills.
