### 2. Bounded cycle mechanics

The loop is bounded, never infinite:

- **Cycle 0 polls immediately** — feedback that already exists at arm time
  is triaged at once.
- Each later cycle is **one backgrounded Bash call** that sleeps the
  interval and then runs the step-3 poll, so the cycle costs one turn and
  the poll output is in hand when the harness reports the call:

  ```bash
  sleep 1860; <the step-3 poll command>
  ```

  Run it with `run_in_background: true`. Per
  `principle-non-blocking-waits`, a foreground wait is
  killed at the harness ceiling (600 s in Claude Code) and spends a turn
  per fragment.
- **Soft cap: 3 cycles** (~90 minutes). At cycle 3, if nothing has
  stopped the loop already, end the interactive session — do not sleep
  again. Print a handoff: the current baseline state (unresolved-thread
  ids, triaged-comment ids, PR `state`, `reviewDecision`, head SHA) and
  the exact command to resume the watch as a scheduled headless job —
  the scheduled pr-watch job (`~/dotfiles/bin/pr-watch.sh`, run from
  launchd). Re-arming the interactive loop happens only on explicit user
  request; the loop does not re-arm itself.
- The bound is the invariant, not the interval: 3 cycles at ~31 minutes.
  Where a harness offers no background execution, say so and chunk the
  wait into foreground sleeps sized under that harness's ceiling — the
  cycle count is what must hold.

The cap convention is `principle-bounded-loops`: declare the
bound with the loop; hitting it is a loud, terminal, reported outcome.
