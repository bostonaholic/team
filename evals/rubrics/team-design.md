---
agent: team-design
---

# team-design rubric

The DESIGN phase drafts a design against seeded `task.md` + `research.md`. The
seeded artifacts are written into the eval's working dir before the model
spawns (seeding mechanism in `tests/team-design.evals.ts`). The deterministic
axis confirms the topic slug was reused verbatim and a Decisions made section
is present; design quality is the LLM criterion.

1. Topic reuse + decisions with explicit assumptions (kind: deterministic).
   The output must
   carry `topic: token-bucket` and a Decisions made heading, matched by the
   `ground-truth.json` `detection_hint` regexes via `outcomeJudge` — no model
   call. Pass = detection_rate ≥ `minimum_detection`.
2. Design grounding and honest assumptions (kind: llm). 1-5 scale, scored
   only when the deterministic check passes (gated cascade). Judges whether the
   design is grounded in the seeded research facts and whether the recorded
   decisions are genuine, self-resolved choices with honest assumptions and
   named alternatives, not rhetorical filler.
   Anchors:
   - 1 = ignores the seeded research, or decisions are empty/rhetorical.
   - 3 = grounded design but thin or generic decisions.
   - 5 = design cites the seeded research facts and records genuine
     decisions with explicit assumptions and trade-offs.
