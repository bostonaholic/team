# Review Findings

Resolve links in this file from the installed `skills/team/` directory.

## Finding Format

`code-reviewer` uses [Conventional
Comments](https://conventionalcomments.org). `security-reviewer` uses the
`#### [SEVERITY] Brief title` template in its agent file: CRITICAL and HIGH
are Blocking, MEDIUM and LOW are Minor. `technical-writer` uses its
`[REQUIRED|RECOMMENDED]` gap template; every gap is Minor. `ux-reviewer` uses
Working/Broken/Could Improve. Every finding includes a specific `file:line`.

### Comment Style

Address code, not its author. Explain why. Reserve `issue:` for correctness,
security, or maintainability defects; use `suggestion:`/`nitpick:` for
preferences. More than ~10 substantive comments on one change signals a
design problem: propose splitting the change or moving design discussion
outside review.

A finding whose mistake can recur names its class and lists the other
instances found in the review range. A finding with no recurring class names
no class.

### Comment Types

Every body begins with its label and decoration inside literal `**...**`.

**issue (blocking):** must be fixed before approval.

```text
**issue (blocking):** This query interpolates user input without parameterization.
file: src/api/users.ts:42
```

**issue (pre-existing):** a `code-reviewer` label for a defect present at the
merge-base that the branch neither introduced nor made reachable or worse. Its
one `file:` line reads `file: <merge-base-sha>:<path>:<line>`, and the body
adds no second location. The SHA equals the merge-base of one of this round's
`Review range` lines. In multi-repo mode, that match names the repo that holds
`<path>`.

```text
**issue (pre-existing):** This parser drops the last field when a line has no trailing newline.
file: 3f9c2a1e7b4d8c6f0a5e2b9d1c7f4a8e6b3d0c2f:src/csv/parse.ts:88
```

**suggestion (non-blocking):** author may accept or decline.

**nitpick (non-blocking):** minor style/naming; never blocks.

## Gate Types by Reviewer

| Reviewer | Gate Type | Blocks Ship? |
|----------|-----------|--------------|
| `security-reviewer` | HARD | Yes — CRITICAL or HIGH |
| `verifier` | HARD | Yes — any failing check |
| `code-reviewer` | HARD | Yes — any blocking issue |
| `ux-reviewer` | AUTO-FIX | REQUEST CHANGES (a *major*) is auto-fixed in the loop; only COMMENT notes reach you |
| `technical-writer` | ADVISORY | No — findings recorded, pipeline proceeds |

## Severity Tiers and the Auto-Fix Boundary

Every finding has one tier.

| Tier | Findings in this tier | Action |
|------|-----------------------|--------|
| **Blocking** | `issue (blocking)`, a bare `issue:` with no decoration, code-reviewer REQUEST CHANGES, security CRITICAL/HIGH, any verifier failure | Auto-fixed in the loop. **Never** surfaced to the user. |
| **Major** | ux-reviewer REQUEST CHANGES | Same as Blocking. |
| **Minor and below** | `issue (pre-existing)`, `suggestion (non-blocking)`, `nitpick (non-blocking)`, security MEDIUM, security LOW, technical-writer GAPS (REQUIRED and RECOMMENDED alike), any COMMENT-level note | Recorded in the home PR's `review-notes` comment — never presented mid-run. |

**A non-blocking finding never costs a round.** Each auto-fix reruns the
implementer and the phase's reviewers. Minor reaches the human in PR review,
regardless of importance
([human control rules](principles/human-control.md)). Never present findings
mid-run. Tag each Minor-and-below entry in the `review-notes` comment by
reviewer.

## Aggregating Verdicts

1. Any Blocking/Major: FAIL; re-dispatch the implementer with no consult.
2. Otherwise PASS, recording any Minor-and-below in the PR's `review-notes` comment; proceed to SHIP.

Loop until Blocking/Major are zero; no round limit or consultation ends it.
Never aggregate a Blocking/Major away; one CRITICAL blocks shipping.
