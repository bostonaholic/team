---
name: principle-scope-fence
description: 'Restricts execution to approved scope. Apply when working from a plan, structure, or anchored change request.'
user-invocable: false
---

# Scope Fence

Treat the approved upstream artifact as the boundary: it authorizes exactly the change it names; document work outside it without performing it.

- Do not add steps, slices, or features beyond the plan; record missing work as a finding.
- Refactor adjacent code only when planned; otherwise record the opportunity.
- Keep applied fixes within approved file-and-line anchors; return expanded fixes for approval.
- Expand scope by updating the governing artifact and re-review material changes.
- Never expand or shrink silently; record expansions and omissions under `principle-skip-loudly`.
