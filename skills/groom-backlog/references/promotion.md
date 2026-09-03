# Promotion mode

Use only for `promote <issue-number>` mode.

1. Create and print a `groom-backlog` run cache. Load only the named board
   item, full issue fields, all comments, dependency links with completeness
   counts, board status/priority options, and ready-column occupancy. The
   issue must be on the scoped board. Cache the original body before drafting.
2. Verify claims under the main skill's repository-match and untrusted-data
   rules. Record `claims hold`, `partially stale`, or `premise evaporated` in
   `verification.md`. Evaporation proposes a separately approved closure;
   never promote it.
3. Rewrite to problem, verifiable outcome, and acceptance criteria. Preserve
   technical detail under implementation notes. Set priority using the four
   tiers; smaller verified scope wins ties.
4. An open declared or verified prose blocker omits the move but allows the
   rewrite and priority. Propose a missing link; do not draw it silently.
5. Move to Ready last. The ready WIP limit is 5: a full column requires an
   approved swap back to Backlog; a pre-existing count above 5 permits no add.
   A `bug` is never promoted to Ready because its Bugs state is already
   ready-to-pull. Never add a status-like label.
6. Write exact steps to `plan.md`, present one recommendation for each choice,
   and stop. After approval, re-read before each mutation and verify every
   written value. A new comment, body change, close, or in-flight move skips a
   proposed closure.
