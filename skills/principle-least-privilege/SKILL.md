---
name: principle-least-privilege
description: 'Defines least privilege. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Least Privilege

Enforce constraints by withholding the capability, not by asking for restraint; prompts never change a role's actual tools.

- Reviewers hold no Write/Edit and run in plan mode; they cannot fix and approve their own findings.
- Give child processes an environment allowlist and their own credential block, never another vendor's or the parent's full environment.
- Dispatch to the narrowest target able to perform the task.
- Refuse command-sink targets for required read-only guarantees whenever a narrower target is available.
- If every target exceeds the task's needs, scope the prompt explicitly and report the guarantee as prompt-level, not structural.
- When falling back to a full-tool context, state that the structural guarantee no longer applies.
