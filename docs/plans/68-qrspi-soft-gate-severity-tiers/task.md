---
topic: qrspi-soft-gate-severity-tiers
date: 2026-06-24
phase: task
ticketId: "68"
---

# Bug: qrspi-workflow SOFT gate examples contradict severity tiers

## Description

`skills/qrspi-workflow/SKILL.md` (SOFT gate section) lists *code review
suggestions* and *UX review feedback* as canonical SOFT-gate examples. Both
are wrong under the severity model introduced in PR #23:

- `code-reviewer` REQUEST CHANGES is **Blocking** (auto-fix).
- `ux-reviewer` REQUEST CHANGES is **Major** (auto-fix).

The single source of truth is `skills/code-review/SKILL.md` → "Severity Tiers
and the Auto-Fix Boundary". An agent loading both skills sees contradictory
guidance; the consult guard calls a prompt listing a Blocking/Major finding "a
defect."

## Fix (Option 2, decided in issue #68)

Drop the SOFT example list and cross-reference the severity-tier table in
`skills/code-review/SKILL.md` — the same pattern `team-implement` and `team`
already use. Keeps the severity model defined in exactly one place.

GitHub issue: https://github.com/bostonaholic/team/issues/68
