---
agent: team-structure
---

# team-structure rubric

The STRUCTURE phase slices an approved `design.md` into vertical slices. The
seeded design is written into the eval's working dir before the model spawns
(seeding mechanism in `tests/team-structure.evals.ts`). The deterministic axis
confirms topic reuse and the presence of verification-checkpoint language;
slice quality is the LLM criterion.

1. Topic reuse + verification checkpoints (kind: deterministic). The output
   must carry `topic: token-bucket` and reference verification/checkpoint
   language, matched by the `ground-truth.json` `detection_hint` regexes via
   `outcomeJudge` — no model call. Pass = detection_rate ≥ `minimum_detection`.
2. Vertical-slice quality (kind: llm). 1-5 scale, scored only when the
   deterministic check passes (gated cascade). Judges whether each slice is
   genuinely end-to-end (touches the layers needed to deliver one piece of
   functionality) with an independently checkable verification step, rather
   than a horizontal layer-by-layer split. Anchors:
   - 1 = horizontal slices (all models, then all handlers) or no checkpoints.
   - 3 = vertical slices but vague or shared verification.
   - 5 = each slice is end-to-end with its own concrete verification checkpoint.
