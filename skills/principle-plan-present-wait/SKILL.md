---
name: principle-plan-present-wait
description: "Apply when mutations need approval: present the plan and execute only approved items."
user-invocable: false
---

# Plan, Present, Wait

**Invariant:** Write and present mutations before execution; apply only the
answered subset or an item allowed by the verified-confidence carve-out.

**Rules:**
- Before any mutation, write the plan. Presentation and execution are separate
  turns. Persist it when approval may cross another turn or compaction; a
  same-session punch list may remain in conversation.
- Present each irreversible mutation as the exact text it creates, one
  consequential question with exactly one recommendation. A reversible class
  may share approval only when every target, evidence item, and undo is named.
- Outside the carve-out, no answer means no mutation; a partial answer permits
  only its answered subset.
- Re-read the plan and revalidate every item against the approved class before
  execution. Approval never relaxes a hard rule.
- Skip the wait only above the stated verified-confidence bar and within every
  hard rule. Present anything below the bar or matching an auto-apply exclusion,
  regardless of confidence.

**Check:** Does each planned mutation have either an exact user answer or a
verified, hard-rule-compliant carve-out?
