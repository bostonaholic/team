---
name: principle-ask-for-refutation
description: State a claim neutrally and ask to be refuted; a verifier that knows your verdict anchors to it — pointed to by nested-agents and cross-model-review when a check is handed off.
user-invocable: false
---

# Ask To Be Refuted

A principle, not a gate. When you hand a claim to someone else to check, state
it as a neutral, falsifiable sentence with its evidence located, and ask them
to refute it. A helper that knows your conclusion will anchor to it and verify
nothing — it will find the reasoning that supports the answer it was handed,
which is confirmation dressed as a second opinion. What you want back is the
strongest attempt to break the claim.

## What it rules out

- **Shipping your verdict with the claim.** Severity, confidence, and your
  reasoning are conclusions the verifier is supposed to reach on its own.
- **A claim phrased so that nothing could falsify it.** "This looks risky"
  gives the verifier no proposition to test and no evidence to test it
  against.
- **Asking for confirmation.** "Can you check I am right about this?" names
  the answer you want, and a cooperative verifier will find it.
- **Reusing a verifier that has already judged your earlier claims.** It has
  built a model of your reliability, which is the anchoring this rule removes.
- **An unlocated claim.** Without the file, the line, or the artifact, the
  verifier reconstructs your search instead of testing your conclusion.

## Boundary

- It governs the handoff, not the outcome. What you do with the reply is
  `principle-verify-before-you-adopt`, which starts where this rule ends.
- Withholding your verdict is not withholding context. A claim that a rule was
  broken carries the rule, because a claim stripped of it becomes a different,
  weaker claim that gets answered correctly and uselessly.
- It applies where the point of the handoff is a check. Delegating work,
  gathering material, or asking a question of fact is a different errand with
  no verdict to leak.

## Where it applies

- `skills/nested-agents/SKILL.md`
- `skills/cross-model-review/SKILL.md`
