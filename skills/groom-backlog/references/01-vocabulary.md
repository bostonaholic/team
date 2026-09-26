## Vocabulary

The method is tracker-agnostic; GitHub Projects v2 is the worked example throughout.

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

The actions the steps below take, in the order a run performs them:

- **Verify**, then **Rank**, then **Cluster**.
- **Describe** — create a grouping construct, or write or extend its description: one or two
  present-tense sentences stating a property of the system that is either true or false, not
  a list of work.
- **Retarget** — move a construct's date out of the past, into the project window and the
  remaining iterations.
- **Place** — put a cluster under the grouping construct whose description covers its outcome.
- **Refine** — rewrite an issue body to the ready-to-work standard: problem, verifiable
  outcome, acceptance criteria.
- **Triage** — give an unsorted issue its first classification: priority, labels, and state.
  Priority comes after the refine.
- **File** — create a new issue, only against its own explicitly answered question — never as
  a side effect of another answer.
- **Close** — end an issue whose premise evaporated, with dated evidence, behind its own
  approval.
- **Link** — record a dependency or decomposition relationship. Links go last among the
  writes; one that touches a just-closed endpoint must die at the endpoint re-read.
- **Promote** — bring one item to the ready-to-work standard, then move its card into the
  ready column. The board pass offers one; only promotion mode performs one.
