### 2. Bounded cycle mechanics

Call the Skill tool with `pr-watch-mechanics`. It owns the cycle timing,
the 3-cycle soft cap, the handoff, and the three stop conditions that are
loop mechanics rather than actions of this skill.

Bind its three slots:

- **Poll command** — the step-3 poll.
- **Cycle-0 subject** — feedback that already exists at arm time is
  triaged at once.
- **Handoff state** — the current baseline state: unresolved-thread ids,
  triaged-comment ids, PR `state`, `reviewDecision`, and head SHA.
