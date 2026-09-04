### Step 4 — Rank the verified candidates

Rank the verified candidates with a stated heuristic, so the promotion pick is an
argument rather than a mood. Four tiers, highest first:

1. **shipped-behavior contradictions** — shipped behavior that contradicts itself,
   especially docs and config that give conflicting instructions.
2. **harness reliability** — the reliability of the project's own verification harness.
3. **high-leverage improvements** — well-specified, high-leverage work, preferring open
   questions resolvable during grooming.
4. **strategic unblockers** — strategic or research items that unblock several others.

The tiebreaker: smaller verified scope beats bigger promised impact. A tier tie falls to
the tiebreaker. A residual tie names both candidates and recommends one.

The pool draws only from the verified candidates of Step 3, so the promotion pick is
verified by construction. An empty verified pool means the report names no candidate. An
item the board's own rules exclude from promotion is outside the pool — on this repo's
board, the `bug` label and its `Bugs` bucket. Tier 1 thus catches shipped-behavior
contradictions that do not carry that label.
