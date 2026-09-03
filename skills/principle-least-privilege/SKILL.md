---
name: principle-least-privilege
description: "Apply when granting capabilities: provide only those required for the role."
user-invocable: false
---

# Least Privilege

**Invariant:** Enforce constraints with the narrowest available toolset,
credentials, and environment; prose alone provides no structural guarantee.

**Rules:**
- Reviewers have no Write/Edit capability and run in plan mode.
- Give each child an environment allowlist and only its own credentials, never
  another vendor's or the parent's full environment.
- Choose the narrowest capable dispatch target. If a rule requires structural
  read-only enforcement, refuse a target with a command sink when a narrower
  target exists.
- If every target has excess capability, scope the prompt and report that the
  assurance is prompt-level, not structural.
- On fallback to a full-tool context, explicitly withdraw any structural
  assurance claim.

**Check:** Does the actual capability boundary enforce every assurance claimed?
