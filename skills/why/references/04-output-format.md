## Output format

Keep the confidence separation intact — it is the product.

- **The Question** — one or two sentences restating what was asked.
- **The Code in Question** — file paths, line ranges, key symbols.
- **What We Found** — one bullet per claim with textual evidence, tagged
  `[Direct]` or `[Supported]`, each with its citation.
- **What We Can Reasonably Infer** — `[Inferred]` claims in hedged
  language, each with its visible inference chain ("Given A and B,
  likely C"). Omit the section when there is nothing to infer.
- **Competing Hypotheses** — when the evidence fits several stories,
  each with the evidence for and against. Never force a winner. Omit
  when one answer is clear.
- **What We Don't Know** — the specific gaps: questions the evidence did
  not answer, searches that came up empty.
- **Sources Consulted** — one line per category:
  `- <Category> (<tool>): <what was searched>. <found / no relevant results / skipped — reason>.`
  Every category appears — including the empty and the skipped — so the
  reader can judge coverage at a glance and redirect.

When the question is a precursor to changing the code, close with a
**Preserve / Change / Avoid / Risk** constraint set translating the
lineage findings into inputs for the change — the shape a design's
decision record wants (`skills/documenting-decisions/SKILL.md`).
