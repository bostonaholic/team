---
name: pr-watch-mechanics
description: 'Bounded watch-loop mechanics for the pr-watch skills: cycle timing, soft cap, handoff. Load when running or authoring a PR watch loop.'
user-invocable: false
---

# PR watch mechanics

The cycle timing, bound, and handoff every PR watch loop runs. A consuming
skill owns what each cycle *does*; this skill owns how the loop is paced,
bounded, and ended. `pr-watch-as-author` and `pr-watch-as-reviewer` both
load it.

A consumer binds three slots and nothing else:

| Slot | What the consumer supplies |
| --- | --- |
| Poll command | The command its own poll step runs. |
| Cycle-0 subject | What an already-satisfied condition at arm time means for it. |
| Handoff state | The fields its handoff prints. |

## The loop is bounded, never infinite

- **Cycle 0 polls immediately** — the condition that already holds at arm
  time is handled at once, on the consumer's cycle-0 subject.
- Each later cycle is **one backgrounded Bash call** that sleeps the
  interval and then runs the consumer's poll command, so the cycle costs
  one turn and the poll output is in hand when the harness reports the
  call:

  ```bash
  sleep 1860; <the poll command>
  ```

  Run it with `run_in_background: true`. Per
  `principle-non-blocking-waits`, a foreground wait is
  killed at the harness ceiling (600 s in Claude Code) and spends a turn
  per fragment.
- **Soft cap: 3 cycles** (~90 minutes). At cycle 3, if nothing has
  stopped the loop already, end the interactive session — do not sleep
  again. Print a handoff: the consumer's handoff state and the exact
  command to resume the watch as a scheduled headless job — the scheduled
  pr-watch job (`~/dotfiles/bin/pr-watch.sh`, run from launchd).
  Re-arming the interactive loop happens only on explicit user request;
  the loop does not re-arm itself.
- The bound is the invariant, not the interval: 3 cycles at ~31 minutes.
  Where a harness offers no background execution, say so and chunk the
  wait into foreground sleeps sized under that harness's ceiling — the
  cycle count is what must hold.

The cap convention is `principle-bounded-loops`: declare the
bound with the loop; hitting it is a loud, terminal, reported outcome.

## Stop conditions this skill owns

Three stop conditions are loop mechanics rather than consumer actions, and
each is reported by name:

- **User interrupt** — the escape hatch. Pressing Esc or sending a message
  stops the loop between Bash calls at any time.
- **3-cycle soft cap** — print the handoff above and end the interactive
  loop.
- **3 consecutive poll failures** — stop and name the error.

A consumer adds its own terminal conditions (an approval, a merge or
close, a state its gate depends on) and reports them the same way. It
never restates the three above.
