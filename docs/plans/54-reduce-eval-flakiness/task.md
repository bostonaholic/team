---
topic: reduce-eval-flakiness
date: 2026-06-24
phase: task
ticketId: "54"
---

# Reduce flakiness in behavioral evals (planted-null-deref flaps pass/fail)

The paid behavioral eval `tests/code-reviewer.evals.ts` (`planted-null-deref`)
flaps pass/fail across back-to-back runs with no code change — inherent LLM
sampling variance scored against a hard 100%-detection threshold.

## Decision (from issue #54)

Option 1 (retry) + reporter fix:

1. Add `--retry=2` to the `test:evals` (and `test:evals:all`) scripts so a
   usually-passing eval gets retried before failing the suite. Cost grows only
   on flaps.
2. Make the eval reporter (`tests/helpers/eval-store.ts`) record only the
   **final post-retry outcome** per test. Today `addTest` appends one entry
   per attempt, so a retried flap leaves a stale intermediate failure beside
   the recovered pass — inflating `total_tests`/`failed` and corrupting the
   regression comparison. Fix: `addTest` upserts by name.

## Affected files

- `package.json` — `test:evals`, `test:evals:all` (add `--retry=2`)
- `tests/helpers/eval-store.ts` — `addTest` upsert-by-name
- `tests/helpers/eval-store.test.ts` — failing test pinning the dedup behavior

Closes #54.
