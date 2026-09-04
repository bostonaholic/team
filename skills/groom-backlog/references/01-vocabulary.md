## Vocabulary

The method is tracker-agnostic. Only the nouns change, and GitHub Projects v2 is the worked example throughout.

| Concept in the method | GitHub Projects v2 | Linear | Jira |
| --- | --- | --- | --- |
| Grouping construct | milestone | project milestone | epic / fix version |
| Column / state | Status field | workflow state | status |
| Priority | Priority field | priority 0–4 | Priority field |
| Iteration | iteration field | cycle | sprint |
| Dependency link | issue `blocked by` / `blocks` | blocked-by relation | "is blocked by" link |
| Decomposition link | sub-issue / parent | sub-issue / parent | subtask / parent |

A **dependency link** orders two pieces of work in time. A **decomposition link** says one is
part of the other. They are not interchangeable, and no tracker infers either.

The actions the steps below take, in the order a run performs them — one word each:

- **Verify** — check an issue's factual claims against the code and the tracker before
  trusting them.
- **Rank** — order the verified candidates by the four-tier heuristic, so the promotion pick
  is an argument rather than a mood.
- **Cluster** — group open issues by the outcome they serve, not the component they touch.
- **Describe** — create a grouping construct, or write or extend its description: one or two
  present-tense sentences stating a property of the system that is either true or false.
- **Retarget** — move a construct's date out of the past, into the project window and the
  remaining iterations.
- **Place** — put a cluster under the grouping construct whose description covers its outcome.
- **Refine** — rewrite an issue body to the ready-to-work standard: problem, verifiable
  outcome, acceptance criteria.
- **Triage** — give an unsorted issue its first classification: priority, labels, and state,
  so it stops being invisible to every filter. Priority comes after the refine, because the
  tiers weigh verified scope and the rewrite is what pins the scope down.
- **File** — create a new issue, only against its own explicitly answered question — never as
  a side effect of another answer.
- **Close** — end an issue whose premise evaporated, with dated evidence, behind its own
  approval.
- **Link** — record a dependency or decomposition relationship so the board's ready-signals
  can see it. Links go last among the writes: a link can only name issues that already
  exist, and one that touches a just-closed endpoint must die at the endpoint re-read.
- **Promote** — bring one item to the ready-to-work standard, then move its card into the
  ready column. The board pass offers one; only promotion mode performs one.
