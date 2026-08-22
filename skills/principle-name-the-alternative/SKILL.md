---
name: principle-name-the-alternative
description: A decision with no named rejected alternative is not a decision — pointed to by documenting-decisions, technical-design-doc, and authoring-designs when a choice is recorded.
user-invocable: false
---

# Name The Alternative

A principle, not a gate. Every decision implies rejected alternatives. Naming
them, and saying why each was rejected, is what turns a preference into a
decision a later reader can audit. Without them the record says only that
somebody chose something, which leaves the next reader unable to tell a
considered trade-off from the first idea that worked.

## What it rules out

- **A recorded choice with no rejected option beside it.** The reader cannot
  tell whether alternatives were weighed or never came up.
- **A straw alternative** — an option nobody would pick, listed so the section
  is not empty. It records no trade-off and hides the real contender.
- **A rejection with no reason**, or one whose reason is a restatement of the
  choice ("rejected because the other approach is better").
- **A reason that names no cost.** Every rejected alternative was attractive
  for something; the record says what was given up to reject it.
- **Deferring the alternatives to a later pass.** They are hardest to
  reconstruct once the choice has settled and the arguments are forgotten.

## Boundary

- It governs decisions, not every sentence in an artifact. A fact, a
  measurement, or a constraint has no alternative to name.
- It asks for the alternatives that were genuinely in play, not an exhaustive
  survey. Two real contenders beat six padded ones.
- Where the choice is between doing something and doing nothing, "do nothing"
  is the alternative, and it earns the same reason as any other.

## Where it applies

- `skills/documenting-decisions/SKILL.md`
- `skills/technical-design-doc/SKILL.md`
- `skills/authoring-designs/SKILL.md`
