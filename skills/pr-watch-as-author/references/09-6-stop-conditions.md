### 6. Stop conditions

The loop stops on:

- **Approval** — run the hand-off in step 7.
- **Merge or close** — the PR reached a terminal state. Report it.
- **User interrupt** — the escape hatch. The user can stop the watch at
  any time. Pressing Esc or sending a message stops the loop between
  Bash calls.
- **3-cycle soft cap** — print the handoff (baseline state plus the
  resume command for the scheduled pr-watch job) and end the
  interactive loop. Re-arming it happens only on explicit user request.
- **3 consecutive poll failures** — stop and name the error.
