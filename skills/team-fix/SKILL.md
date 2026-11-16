---
name: team-fix
description: 'Use for the Team bug-fix pipeline only on explicit request. Never infer from an ordinary bug fix. Same as `/team fix`.'
effort: high
argument-hint: "<ticket id, issue URL, or bug description>"
---

# Team Fix

`/team-fix <bug>` is `/team fix <bug>`. Call the Skill tool with `team` and the arguments `fix $ARGUMENTS`; the [`fix` route](../team/references/routing.md) owns the whole run.
