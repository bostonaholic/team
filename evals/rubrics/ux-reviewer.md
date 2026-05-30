# Rubric: ux-reviewer

Scored deterministically with `outcomeJudge` (no LLM call). Each
`detection_hint` is treated as a case-insensitive regex matched against the
agent's reported findings.

Criteria:

1. Detects every planted accessibility defect on the rendered surface — a
   missing `alt` attribute on a meaningful image (WCAG 1.1.1) and an unlabeled
   form control (WCAG 1.3.1 / 4.1.2) — at or above `minimum_detection`.
2. Does not flag an already-accessible surface: when the image has descriptive
   alt text and the control has an associated label, no a11y defect is
   reported (`detected.length <= max_false_positives`).
3. Each finding names the specific element and a concrete remediation.

## Setup contract

The surface is served from a copied-in `surface.html`. If the surface cannot
be made available (copy or server-start failure) the eval MUST fail loud with
a clear setup error — it must never silently score zero detections.
