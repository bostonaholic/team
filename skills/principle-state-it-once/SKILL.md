---
name: principle-state-it-once
description: A fact lives in one file and every other surface carries its path — pointed to by qrspi-workflow and code-review when the same fact would be written twice.
user-invocable: false
---

# State It Once

A principle, not a gate. A fact lives in one file. Every other surface that
needs it carries that file's path rather than a second copy. Two copies of a
fact are two facts as soon as one is edited, and nothing tells a reader which
one is current — the copy that goes stale looks exactly like the copy that did
not.

## What it rules out

- **A second full statement of a rule** in a file that could have carried its
  path instead.
- **A summary that quietly becomes a rival source.** A paraphrase kept
  "for convenience" drifts from the original and then contradicts it.
- **A path that names no anchor** — pointing at a file without saying which
  part of it, which leaves the reader to re-derive the fact and often to
  restate it locally.
- **A pointer to a copy.** The path names where the fact lives, not another
  surface that also mentions it.
- **Editing one copy.** A change to a duplicated fact that updates one site
  produces a disagreement that no reader can resolve from the text.

## Boundary

- It governs the fact and its rationale, not every mention. Naming a rule and
  pointing at it is not a second statement, and a source that keeps one
  imperative sentence beside a pointer is following this rule, not breaking
  it.
- A reader who cannot open a second file is not served by a path. Where a
  surface must stand alone, the rule is stated inline, and that case belongs
  to `principle-every-rule-reaches-every-surface`, which bounds this one.
- It is about facts, not vocabulary. Repeating a term is how prose stays
  readable.

## Where it applies

- `skills/qrspi-workflow/SKILL.md`
- `skills/code-review/SKILL.md`
