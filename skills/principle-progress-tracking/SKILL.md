---
name: principle-progress-tracking
description: "Apply to multi-step procedures: track one todo per step in the executing context."
user-invocable: false
---

# Progress Tracking

**Invariant:** A context executing two or more ordered steps tracks one item per
step in its own ledger; this convention creates no artifact and blocks nothing.

**Rules:**
- Seed every item before starting. Mark an item `in_progress` when its step
  starts and `completed` when it lands.
- Use numbered steps when present. Otherwise use natural work units such as a
  slice, question, or hard-gate finding—not phases, files, or sentences.
- Without a todo tool, state the ledger once inline and name each completion.
- The orchestrator owns the phase ledger. Agents track sub-steps only in their
  own context and never merge or read across ledgers. A standalone skill owns
  its ledger.
- `skills/qrspi-workflow/SKILL.md` owns the orchestrator's phase-level contract.

**Check:** Does this executing context expose every ordered step and its current
state in exactly its own ledger?
