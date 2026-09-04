---
name: principle-scope-fence
description: 'Defines scope fence. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Scope Fence

The approved upstream artifact bounds the work: it authorizes exactly
the change it names. Work outside the fence is documented, never done —
and scope expands by changing the artifact, never by quietly exceeding
it.

**Why:** What was reviewed is the plan; silent expansion ships
unreviewed work under a reviewed label. The fence is also what makes
"done" decidable: a bounded change can be verified, an elastic one
cannot.

**Pattern:**
- Do not add steps, slices, or features beyond the plan. A missing piece
  is documented as a finding, not implemented on the spot.
- Refactor or "improve" adjacent code where the plan calls for it, and
  note the opportunity where it does not.
- An applied fix stays bounded to the anchored file and lines it was
  approved for; a change that wants to grow returns for approval.
- If scope must genuinely expand, update the governing artifact — and for
  a material change, go back through its review.
- Never expand or shrink scope in silence: record the expansion, or the
  omission, loudly where the reader will look
  (`principle-skip-loudly`).
