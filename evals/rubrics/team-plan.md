---
agent: team-plan
---

# team-plan rubric

The PLAN phase expands a `structure.md` into a tactical plan. The
seeded structure is written into the eval's working dir before the model spawns
(seeding mechanism in `tests/team-plan.evals.ts`). The deterministic axis
confirms topic reuse and acceptance-test-mapping language; plan quality is the
LLM criterion.

1. Topic reuse + acceptance-test mapping (kind: deterministic). The output must
   carry `topic: token-bucket` and reference acceptance-test language, matched
   by the `ground-truth.json` `detection_hint` regexes via `outcomeJudge` — no
   model call. Pass = detection_rate ≥ `minimum_detection`.
2. File-level step quality (kind: llm). 1-5 scale, scored only when the
   deterministic check passes (gated cascade). Judges whether each seeded slice
   is expanded into concrete file-level steps (naming the files to touch) with
   acceptance tests mapped per slice, rather than restating the structure.
   Anchors:
   - 1 = restates the structure with no file-level steps or test mapping.
   - 3 = file-level steps but tests mapped vaguely or only once overall.
   - 5 = each slice expanded into named-file steps with per-slice acceptance
     tests.
