---
agent: changelog
---

# changelog rubric

The changelog methodology produces a text artifact (Keep-a-Changelog markdown),
not a findings list, so the deterministic axis scores *required properties* of
that markdown (design Open-question #2 escape hatch). Criteria are evaluated in
order; each declares its `kind`.

1. Keep-a-Changelog section headings (kind: deterministic). The output must
   contain a `### Added` section (for the feat commit) and a `### Fixed`
   section (for the fix commit), matched by the `ground-truth.json`
   `detection_hint` regexes via `outcomeJudge` — no model call. Pass =
   detection_rate ≥ `minimum_detection`.
2. Filtering and user-facing language (kind: llm). 1-5 scale, scored only when
   the deterministic heading check passes (gated cascade). Judges whether the
   `chore:`, `test:`, `refactor:`, `ci:`, and `docs:` commits were excluded
   from the output and whether entries are written in user-facing language
   ("Users can now…" / "We fixed…") rather than restating commit subjects.
   Anchors:
   - 1 = internal commits leaked in, or entries are verbatim commit subjects.
   - 3 = correct sections but one internal commit leaked or one entry is still
     implementation-flavored.
   - 5 = only the feat + fix appear, both rewritten in plain user-facing prose.
