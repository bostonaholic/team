---
name: principle-subtract-before-you-add
description: 'Requires removal before addition. Apply when sequencing an addition, refactor, or rewrite of code, prompts, or skills.'
user-invocable: false
---

# Subtract Before You Add

Remove complexity first, then build on the simpler base; leave the design simpler behind the same or a smaller surface than you found it.

Why: Adding to a complex system compounds complexity; removing first shrinks the surface and usually makes the next design obvious.

- Sequence removal before construction: delete what the change replaces or leaves unused, then add.
- Cut before you polish: reach the minimum that satisfies the spec before investing in quality.
- Design for observed usage; add no validator, parser, guard, or option beyond what the design, plan, or tests demand.
- Treat an out-of-spec feature as dragging its own guards behind it; leave it out and record it as a finding.
- Simplify prompts and skills the same way: remove redundant instructions and templates, and delete a reference with no novel content instead of keeping a stub.
- Keep removals inside the approved scope under `principle-scope-fence`; record a wider removal as an opportunity, never perform it unasked.
