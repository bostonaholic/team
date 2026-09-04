### Step 2 — Compute the gap inventory, do not eyeball it

Produce this table into `$RUN_DIR/gap-inventory.md` before forming any opinion:

- open issues with no grouping construct, and issues still in a triage state
- issues with no priority set — on some trackers `0` means *unset*, not *urgent*
- grouping constructs past their date, complete, undescribed, or empty
- issues missing a problem statement, a desired outcome, or acceptance criteria
- issues whose labels diverge from the project's dominant set
- estimate coverage — under a third, say so and stop treating rollups as meaningful
- work owned by another team or repo with nobody named on the other side
- issues in a ready-to-work or in-progress state with a declared blocker still open — the
  board is advertising work nobody can start
- declared links that cycle, point at themselves, or point at a closed or deleted issue
- blockers outside this repository, and blockers not on the board at all
