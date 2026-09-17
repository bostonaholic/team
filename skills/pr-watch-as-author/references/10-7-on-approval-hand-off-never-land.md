Before invocation or continuation, read [skill dispatch](../team/references/skill-dispatch.md); apply its installation-aware continuation and self-resume rules.

### 7. On approval — hand off, never land

Never auto-run `/shipit` — the merge decision belongs to the user. When
the PR is approved:

1. Report the approval.
2. Run one final triage pass over any still-unresolved threads.
3. End with the handoff: `Next: explicitly request shipit when you want to land it, using the continuation choices.`
