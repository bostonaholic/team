# Focused work

Give each agent one job, declared predecessor inputs, and one bounded artifact or text report.
Use one predecessor when sufficient. Never inspect undeclared agent state.
The dispatcher persists reports that must survive the turn and owns relayed content.
Keep routing, sibling retries, and the phase table in the orchestrator. Split utility agents that perform unrelated jobs.
Helpers work directly without further sub-agents and obey their declared reply limits.

## Minimum scoped change

Remove what the approved change replaces or leaves unused before adding its replacement.
Add only observed usage required by the design, plan, or tests. Avoid speculative validators, parsers, guards, and options.
Remove repeated prompt instructions and references with no distinct content. Do not retain obsolete stubs.
Record wider removal opportunities and unapproved features without implementing them.

## Optional enhancements

Nested scouts, vendor passes, couriers, and uploads use their owning operation's fallback on absence, error, silence, or malformed results.
Perform producer work inline when permitted. For unavailable uploads, retain the local evidence and report the incomplete attachment.
Never repair malformed helper output and then trust it. Never soften a verdict because an optional pass did not run.
Report the skip and reason. Optional enhancements must not block, create retry loops, or prompt the user.
These fallbacks apply only to enhancements. Required resources and independent review remain mandatory.
