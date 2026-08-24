---
name: principle-comment-the-why
description: A comment explains a non-obvious why, never a what, and stays timeless — pointed to by engineering-standards and code-review when source comments are written or read.
user-invocable: false
---

# Comment The Why

A principle, not a gate. A comment explains a non-obvious why — a constraint,
a workaround, a surprising requirement — and never a what, because
intention-revealing names and structure carry the what already. It is
permitted only when neither the code nor a test can carry the explanation. It
is timeless: it describes the code as it exists now, and it stays true when
the surrounding code changes.

**The permitted comment class is a non-obvious constraint or a deliberate
oddity:** API limits, compatibility, security assumptions, performance,
ordering, concurrency, and framework surprises. For a deliberate oddity, state
the consequence of removing or simplifying the code. A comment outside that
class has to justify itself against every rule below.

## What it rules out

- **A comment restating the code.** Only a non-obvious why earns one, and only
  when neither intention-revealing code nor tests can carry it. Doc comments
  on exported/public interfaces are exempt — they follow the ecosystem's
  convention (JSDoc, docstrings, rustdoc) and define the abstraction, though a
  doc comment that merely repeats the signature is a what-comment after all.
- **A comment standing in for a rewrite.** A comment that feels necessary is a
  signal to rewrite the code until the comment is unnecessary. Extract a
  well-named function or variable before reaching for one.
- **References that rot** — ticket/issue IDs, plan/slice/phase markers, and
  doc-section references. The tracker migrates, the plan is deleted, the
  section is renumbered, and the comment becomes a lie. Exemption: an
  upstream-bug link where the link IS the why, which stays true for exactly as
  long as the workaround does.
- **Process narration.** No dates, corrections, changelog entries, or
  historical narration, and never a description of the edit that produced the
  code, the prompt, review feedback, or agent instructions. "Previously",
  "Originally", "As of", and "Correction" are detection hints, not the rule.
- **Commented-out code.** Version control remembers deleted code.
- **The vague, the remote, the unverified, and the stale.** Name the exact
  condition, risk, or dependency, never "handle edge case". Sit next to the
  code explained, and refer to symbols rather than line numbers. Document only
  verified behavior, do not repeat what types, tests, names, and public docs
  already carry, and update or delete a comment in the diff that invalidates
  it.

Before keeping one: does it explain why? Would code or tests carry it better?
Is it true after this change, with no reference to the process? Will it still
be true when the surrounding code changes?

These rules govern comments inside source files. A comment written on a diff
is a review finding, and `skills/conventional-comments/SKILL.md` governs that
artifact instead.

## Boundary

- It governs implementation comments in source files. The prose of a design
  doc, a commit message, or a PR body is a different artifact under different
  rules.
- It bans no class of explanation, only misplaced ones. A constraint that must
  be recorded and cannot live in a name or a test is exactly what a comment is
  for, and deleting it to satisfy a word count is the opposite failure.
- What makes a review finding usable is `principle-make-findings-actionable`,
  not this rule.

## Where it applies

- `skills/engineering-standards/SKILL.md`
- `skills/code-review/SKILL.md`
