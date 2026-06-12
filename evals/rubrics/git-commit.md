---
agent: git-commit
---

# git-commit rubric

The git-commit methodology produces a text artifact (a commit message), not a
findings list, so the deterministic axis scores *required properties* of that
message rather than planted defects (design Open-question #2 escape hatch).
Criteria are evaluated in order; each declares its `kind`.

1. Conventional-Commit subject shape (kind: deterministic). The subject must
   match `<type>[optional scope]: <description>` where `type ∈ {feat, fix,
   refactor, test, docs, chore, perf, ci, revert}`. Computed by the harness
   from `ground-truth.json` `detection_hint` regexes via `outcomeJudge` — no
   model call. Pass = detection_rate ≥ `minimum_detection`.
2. Message quality (kind: llm). 1-5 scale, scored only when the deterministic
   subject-shape check passes (gated cascade). Judges imperative mood, no
   trailing period on the subject, ≤50-char subject, and a body that explains
   the *why* rather than restating the diff. Anchors:
   - 1 = past-tense or vague subject, no body, or trailing period.
   - 3 = imperative subject of the right shape but a thin or what-only body.
   - 5 = imperative ≤50-char subject, no trailing period, body that explains
     motivation and consequences.
