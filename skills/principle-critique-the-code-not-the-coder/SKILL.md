---
name: principle-critique-the-code-not-the-coder
description: Address the artifact, not the author, and assume competence — pointed to by conventional-comments when a finding on someone else's work is phrased.
user-invocable: false
---

# Critique The Code, Not The Coder

A principle, not a gate. Address the artifact, not the person who produced it,
and assume competence: the author had a reason, and you have not heard it yet.
The same finding reads as collaborative or hostile depending only on where the
sentence puts its subject, and the hostile phrasing buys no extra accuracy
while costing the conversation that would have resolved the disagreement.

## What it rules out

- **A second-person subject on a defect.** "You are not handling the null
  case" makes the author the thing under review; "The null case is not handled
  here" reports the same fact about the code.
- **A defect attributed to a trait** — carelessness, inexperience, haste. The
  trait is unfalsifiable, it is not what the diff shows, and it converts a
  fixable finding into an accusation.
- **A finding dressed as an exclamation.** "This does not make any sense"
  reports the reader's state; "I cannot follow what this branch is doing —
  clarify?" reports the same state and asks for the thing that would resolve
  it.
- **Sarcasm, rhetorical questions, and scare quotes**, each of which encodes a
  judgment the reader has to decode before they can act on it.

## Boundary

- It governs phrasing, never severity. A blocking finding stays blocking, and
  softening the verdict to sound kind is the misreading this rule most often
  produces.
- It asks for no praise, no hedging, and no compliment sandwich. Plain,
  code-directed prose satisfies it completely.
- What a finding must contain is `principle-make-findings-actionable`. This
  rule only decides whose name the sentence takes.

## Where it applies

- `skills/conventional-comments/SKILL.md`
