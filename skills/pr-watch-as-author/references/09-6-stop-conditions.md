### 6. Stop conditions

Beyond the [watch loop](watch-loop.md)'s three, this skill adds three stop
conditions, each reported by name:

- **Approval** — run the hand-off in step 7.
- **Merge or close** — the PR reached a terminal state. Report it.
- **Third-party participant** — step 3's third-party check fired.
