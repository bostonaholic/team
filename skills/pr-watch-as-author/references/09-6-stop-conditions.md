### 6. Stop conditions

`pr-watch-mechanics` owns three: user interrupt, the 3-cycle soft cap, and
3 consecutive poll failures. This skill adds two, each reported by name:

- **Approval** — run the hand-off in step 7.
- **Merge or close** — the PR reached a terminal state. Report it.
