---
agent: team-research
---

# team-research rubric

The RESEARCH phase answers a seeded `questions.md` and writes `research.md`. The
seeded artifact is written into the eval's working dir before the model spawns
(seeding mechanism in `tests/team-research.evals.ts`). The deterministic axis
confirms the topic slug was reused verbatim; research-fact grounding is the LLM
criterion.

1. Topic slug reuse (kind: deterministic). The output must carry
   `topic: token-bucket` copied verbatim from the seeded `questions.md`,
   matched by the `ground-truth.json` `detection_hint` via `outcomeJudge` — no
   model call. Pass = detection_rate ≥ `minimum_detection`.
2. Research-fact grounding (kind: llm). 1-5 scale, scored only when the
   deterministic check passes (gated cascade). Judges whether the findings
   answer the seeded questions and cite concrete codebase facts (file paths)
   rather than restating the questions or inventing intent. Anchors:
   - 1 = restates the questions, no codebase facts, or leaks unstated intent.
   - 3 = answers some questions but thin on concrete file-level grounding.
   - 5 = each seeded question answered with a concrete, file-referenced finding.
