### 3. Bounded cycle mechanics

Call the Skill tool with `pr-watch-mechanics`. It owns the cycle timing,
the 3-cycle soft cap, the handoff, and the three stop conditions that are
loop mechanics rather than actions of this skill.

Bind its three slots:

- **Poll command** — the step-4 poll.
- **Cycle-0 subject** — a gate already satisfied at arm is handled at
  once (the immediate path above).
- **Handoff state** — the tracked-set state: unresolved thread ids,
  plain-comment engagement and verdict state, the arm-time and current
  head SHA, and the arm-time and current auto-merge state.
