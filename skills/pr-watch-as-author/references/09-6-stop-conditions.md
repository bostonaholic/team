### 6. Stop conditions

The loop stops on:

- **Approval** — run the hand-off in step 7.
- **Merge or close** — the PR reached a terminal state. Report it.
- **User interrupt** — the escape hatch. The user can stop the watch at
  any time. Pressing Esc or sending a message stops the loop between
  Bash calls.
- **Cycle-48 timeout** — report the timeout and offer to re-arm.
- **3 consecutive poll failures** — stop and name the error.
