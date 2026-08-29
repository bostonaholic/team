---
name: principle-least-privilege
description: "Apply when granting tools, credentials, or environment to any role or child process. The toolset is the guarantee: enforce a constraint by withholding the capability, not by asking for restraint."
user-invocable: false
---

# Least Privilege

Enforce a constraint by withholding the capability, not by asking for
restraint. On a dispatch path the guarantee is the target's toolset, not
the prose telling it to behave: a prompt does not rewrite an agent body,
and an instruction never widens or narrows what a role can actually
touch.

**Why:** Prose is forgotten about one time in five; a missing Write tool
is not. A constraint that is a property of the harness holds even when
the model does not cooperate — and a role that cannot do the forbidden
thing needs no rule against it.

**Pattern:**
- Reviewers hold no Write/Edit and run in plan mode. A reviewer that can
  fix what it found can approve its own fix.
- A child process receives an environment allowlist and its own
  credential block — never another vendor's, never the parent's full
  environment.
- Prefer the narrowest dispatch target that can run the errand. Where a
  governing rule demands a structural guarantee — a read-only lens — a
  target holding a command sink is refused, whatever else it can do.
  When only a full-tool target exists, the errand rides on an explicitly
  scoped prompt, and the report says the guarantee is prompt-level, not
  structural.
- Match the assurance claim to the mechanism: when work falls back to a
  full-tool context, say the guarantee no longer applies rather than
  keeping the claim while losing the mechanism.
