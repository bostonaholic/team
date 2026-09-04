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
- **Hard cap: 48 cycles** (~24 hours). At the cycle-48 timeout, report the
  timeout and offer to re-arm.
- The bound is the invariant, not the interval: 48 cycles at ~31 minutes.
  Where a harness offers no background execution, say so and chunk the
  wait into foreground sleeps sized under that harness's ceiling — the
  cycle count is what must hold.

The cap convention is `principle-bounded-loops`: declare the
bound with the loop; hitting it is a loud, terminal, reported outcome.
