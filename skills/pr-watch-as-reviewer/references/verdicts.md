# Re-review verdicts

Load only when a tracked item triggers substantive re-review.

- **addressed**: current code removes the concern.
- **answered**: a reply engages the concern and its argument holds against
  current code.
- **pending**: evidence proves neither; wait and write nothing.
- **rejected**: evidence confidently shows the claimed settlement does not
  meet the concern.

Plain comments and unresolved threads default to pending. A plain comment also
requires a later push; a reply alone cannot settle it. A resolved thread gets
deference because its author asserted completion: reject only with very high
confidence and strong disagreement. “Probably fine but” passes. Do not call
silence rejected.

Fetch the item's full comment list and current diff. When head moved, compare
previous and current heads. Verify “fixed” claims in code; distinguish a
substantive answer from restatement or closure language. Cite path, line,
symbol, or commit evidence in the snapshot.

A rejected verdict remains gated after its one rebuttal and may run to the
outer timeout. There is no rebuttal-count cap: the author supplies each new
trigger, while the 48-cycle watch remains the outer bound.
