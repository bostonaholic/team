## Execution

### Step 1 — Resolve the PR

```bash
# If no argument, use the current branch's PR
gh pr view --json number,url,headRefName,baseRefName,title,headRepositoryOwner,headRepository

# If a URL or number was given, prefer explicit
gh pr view "<number-or-url>" --json number,url,title
```

Extract `owner`, `repo`, and `number`.

### Step 2 — Fetch unresolved review threads (GraphQL)

Issue-level comments (`gh pr view --json comments`) do not carry resolution
state. The only reliable source of open review comments is `reviewThreads`
through GraphQL, filtered on `isResolved: false`.

```bash
gh api graphql -F owner="$OWNER" -F repo="$REPO" -F number="$NUMBER" -f query='
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          isOutdated
          path
          line
          startLine
          comments(first: 50) {
            nodes {
              author { login }
              body
              diffHunk
              url
              createdAt
            }
          }
        }
      }
    }
  }
}'
```

Then filter `nodes` where `isResolved == false`. Keep `isOutdated` threads
but flag them — the code they reference can have moved. If the PR has more
than 100 threads, paginate with `after:` cursors.

### Step 3 — Fetch issue-level comments (optional)

Top-level PR comments (not tied to a line) live on a different endpoint:

```bash
gh pr view "$NUMBER" --json comments --jq '.comments[] | {author: .author.login, body: .body, createdAt: .createdAt, url: .url}'
```

These comments carry no resolved flag, so an item stays open until the
author's own follow-up clearly closes it. That follow-up is the only
closure signal the endpoint offers.

### Step 4 — Verify each comment (trust but verify)

Do this first for each comment, before any classification or
recommendation. Reviewers comment against a snapshot of the diff. The
code can have moved since. For every unresolved thread:

1. **Read the current code** at `path` (around `line`/`startLine`) in the
   working tree. Compare it against the thread's `diffHunk`.
2. **Check the diff since the comment**: run
   `git diff origin/<base>...HEAD -- <path>` and
   `git log --oneline -- <path>`. Did a later commit already address,
   move, or delete the code in question?
3. **Prove behavioral claims with a test.** When the comment asserts
   runtime behavior (a bug, an edge case, a race, "this breaks when …"),
   reading code is not proof. The evidence must be a specific named test —
   cited by file path and test name — plus its run result:
   - Prefer an existing test that proves the claim: cite
     `<test-file>:<line>` and the test name, run it, and record pass or
     fail. The test must exercise the claimed behavior — a nearby test
     that touches the same code does not count.
   - Otherwise write a throwaway reproduction test, run it, and record
     pass or fail. Then delete it — never stage or commit it — and quote
     the test body or its key assertion in the evidence. A test that
     fails as the reviewer predicted proves `STILL RELEVANT`. One that
     passes against their claim proves `INACCURATE` or
     `ALREADY ADDRESSED`.
   - If the behavior is too costly to test (external services, production
     data), fall back to code-reading evidence and say so in the verdict
     line.
4. **Assign a verdict**:
   - `STILL RELEVANT` — the code the comment targets is unchanged and the
     ask still applies.
   - `ALREADY ADDRESSED` — a later commit resolved the concern (cite the
     commit SHA as bare text).
   - `STALE` — the referenced code was removed or rewritten, so the
     comment no longer applies as written.
   - `INACCURATE` — the comment's claim does not hold against the actual
     code (for example, the "bug" cannot occur); note the evidence.
5. **Rate confidence in the recommendation.** Assign the rating only
   after the verdict (Hard Rule 1). Only a `STILL RELEVANT` verdict
   reaches the auto-apply bar. For a behavioral claim, a rating
   above 90% rests on the red-green proof: the named reproduction test
   fails before the fix and passes
   after the fix is applied, with the passing run
   happening before any push. Without that proof the rating caps at 90%.

**Post nothing during verification.** A verdict is your reading of the
code, not the author's answer to the reviewer, and the two can disagree —
the user may take a comment you rated `STILL RELEVANT` and decline it, or
answer an `INACCURATE` one with a question instead of a 👎. A reaction is
public and cannot be honestly retracted, so it waits for the decision that
picks it: step 6 for an item the agent auto-applies, and the user's chosen
option for everything on the punch list. Step 7 states each option's
reaction in the menu, so choosing an option is choosing the signal it sends.

The verdict feeds steps 5–7. `ALREADY ADDRESSED` maps to option **F**.
`STALE` and `INACCURATE` usually map to a reply that answers the reviewer
(**C**), or to a decline (**D**) where the claim does not hold, rather than
to a code change. An unclear ask never applies to either — both are
verdicts you reached with evidence — but a one-way-door choice
`decision-making` returns to the user still lands on **G** as usual. Never
mark a thread stale or inaccurate on a hunch — cite the file, line, or
commit that proves it.

### Step 5 — Classify each open thread

For every unresolved thread, decide what it asks for:

| Class | Signal |
|-------|--------|
| **Code change** | "please rename", "this should", "bug: …", suggested diff block |
| **Question** | "?" / "why …" / "what about …" |
| **Suggestion (optional)** | "nit:", "consider", "maybe" |
| **Praise / FYI** | "nice", "+1", no ask |
| **Blocking** | "blocking:", "must fix", reviewer requested changes |
| **Outdated** | `isOutdated: true` |

The class drives which options step 7 offers. If the class is ambiguous,
keep both candidate classes and flag `NEEDS CLARIFICATION` so the user can
disambiguate before any action.

### Step 6 — Auto-apply items above the bar

Run the Authorized Execution path automatically for each item that clears
the auto-apply bar (Hard Rule 2). Such an item rates above 90%
confidence, is `STILL RELEVANT`, and hits no exclusion. Apply the change
bounded to the thread's anchored file and lines, push, post the SHA-cited
reply, and resolve. Record each auto-applied item with its confidence and
the landing commit SHA for the step 7 report.

Add 👍 `THUMBS_UP` to the comment that opened the thread as the change
lands. The decision here is the agent's to make — the item cleared the bar
— and applying the fix is what the reaction claims, so the two go
together. Never react to a comment you wrote yourself.

### Step 7 — Present the report and punch list (the deliverable)

Report in two sections. First, **Auto-applied** — one line per step 6
item with its confidence and landing commit SHA. Then
**Needs your decision** — every remaining unresolved thread as a block
with the comment, a menu of 2–4 tailored options, and exactly one
recommendation. Base the recommendation on the step 4 verdict, the
class, and the current diff — never pick it blindly.

Standard option menu (pick the options that apply):

- **A. Apply the change** — edit `<file>` to do `<specific change>`. When the
  ask is an image rather than code, capture it first, then run
  `/pr-screenshots` against this PR to put it in the description; the upload
  mechanics are in `skills/pr-screenshots/SKILL.md`.
- **B. Apply a variation** — `<a variant that addresses the concern differently>`.
- **C. Reply with the answer** — `<one-line reply sketch>`.
- **D. Decline (will not fix)** — reply with `<one-line rationale>`.
- **E. Defer** — file a follow-up issue / TODO and resolve with a link.
- **F. Mark resolved as-is** — current code already addresses it (cite commit/line).
- **G. Needs clarification** — ask the reviewer when the ask itself is unclear, present the choice to the user when the user owns it, before acting.

**C answers, G asks.** C is the answer to a reviewer's question you
understood, and it posts a reply. G covers two different blockers: your
question about an ask you did not understand, or a one-way-door choice
the user owns rather than you. The first posts a reply; the second
presents the choice to the user instead and touches no code either way.
Only G is a Hard Rule 3 exclusion, so only a G item can never auto-apply
at any confidence.

Each option also carries the reaction it places on the thread's opening
comment, and the menu states it, so the user picks the signal along with
the action. Nothing is posted until they do.

| Option | Reaction |
|--------|----------|
| A. Apply the change | 👍 `THUMBS_UP` |
| B. Apply a variation | 👍 `THUMBS_UP` |
| C. Reply with the answer | none — the thread is still a conversation |
| D. Decline (will not fix) | 👎 `THUMBS_DOWN` when the decline rests on an `INACCURATE` verdict; none when the ask is sound and only the priority or scope is wrong |
| E. Defer | 👍 `THUMBS_UP` |
| F. Mark resolved as-is | 👍 `THUMBS_UP` |
| G. Needs clarification | none — the ask is not understood well enough to judge, or the choice belongs to the user |

The user can override any of these — say so when presenting a 👎, since
that is the one signal a reviewer reads as a rejection. A reaction is never
a substitute for the reply the chosen option calls for.

Block format:

```
[#] <path>:<line>  —  @<author>  —  <class>[, OUTDATED]
    > <1–2 line excerpt of the comment body>
    URL: <thread url>
    Verified: <STILL RELEVANT|ALREADY ADDRESSED|STALE|INACCURATE>  —  <one-line evidence>
    Reaction: none yet — the option you pick places it
    Confidence: <NN%>  —  <one-line why it did not clear the auto-apply bar>

    Options:
      A. <concrete option tailored to this comment>  →  reacts 👍
      B. <alternative option>  →  reacts 👍
      C. <reply-only option>  →  reacts none
      D. <decline option with rationale sketch>  →  reacts <👎|none>

    Recommendation: <A|B|C|D|…>  —  <one-line why>
```

Group blocks by file. List `NEEDS CLARIFICATION` items last. Number
blocks globally so the user can say "do 3, 5, and 7 with the
recommendation. On 4 go with option B."

### Step 8 — Stop and hand off

After the report is rendered, stop. Do not begin editing, posting, or
resolving for `Needs your decision` items in the same turn. Wait for the
user's per-item decisions. The hand-off prompt is in `## Completion`
below.
