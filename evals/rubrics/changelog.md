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
2. Internal-commit exclusion (kind: deterministic). The skill's core job — drop
   `chore:`/`test:`/`refactor:`/`ci:`/`docs:` commits — is checkable for free,
   so it is graded deterministically, not by the model: the distinctive
   nouns/prefixes of the excluded commits (e.g. `eslint`, `ubuntu`, `session
   middleware`, `shared utility`, `chore`, `refactor`, `ci:`) must NOT appear
   in the output. Pass = no internal-commit content leaked.
3. User-facing language (kind: llm). 1-5 `clarity` scale, scored only when both
   deterministic checks above pass (gated cascade). Judges whether the kept
   entries are written in clear, user-facing language ("Users can now…" / "We
   fixed…") rather than restating commit subjects. `clarity`, not
   `completeness`: a correctly-filtered changelog intentionally omits internal
   commits, so a completeness axis would penalize the exact behavior criterion
   2 rewards. Anchors:
   - 1 = entries are verbatim commit subjects / implementation jargon.
   - 3 = understandable but one entry is still implementation-flavored.
   - 5 = every entry rewritten in plain user-facing prose.
