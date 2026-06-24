---
agent: team-design
---

# team-design rubric

The DESIGN phase drafts a design against seeded `task.md` + `research.md`. The
seeded artifacts are written into the eval's working dir before the model
spawns (seeding mechanism in `tests/team-design.evals.ts`). The deterministic
axis confirms the topic slug was reused verbatim and an Open Questions section
is present; design quality is the LLM criterion.

1. Topic reuse + open-questions section (kind: deterministic). The output must
   carry `topic: token-bucket` and an Open Questions heading, matched by the
   `ground-truth.json` `detection_hint` regexes via `outcomeJudge` — no model
   call. Pass = detection_rate ≥ `minimum_detection`.
2. Design grounding and honest open questions (kind: llm). 1-5 scale, scored
   only when the deterministic check passes (gated cascade). Judges whether the
   design is grounded in the seeded research facts and whether the open
   questions are genuine decisions for the user, not rhetorical filler.
   Anchors:
   - 1 = ignores the seeded research, or open questions are empty/rhetorical.
   - 3 = grounded design but thin or generic open questions.
   - 5 = design cites the seeded research facts and lists genuine open
     questions with trade-offs.
