# Focused work

Give each agent one job, declared predecessor inputs (one when sufficient), and one bounded artifact or text report. Never inspect undeclared agent state.
The dispatcher persists reports that must survive the turn and owns relayed content.
Keep routing, sibling retries, and the phase table in the orchestrator. Split utility agents that perform unrelated jobs.
Helpers work directly without further sub-agents and obey their declared reply limits.
For advisory investigation, start with the target diff or execution path; make each further read answer a specific uncertainty, and stop when the requested recommendation is supported. Complete any required coverage checklist.

## Minimum scoped change

Remove what the approved change replaces or leaves unused before adding its replacement.
Add only observed usage required by the design, plan, or tests: no speculative validators, parsers, guards, or options.
Remove repeated prompt instructions and references with no distinct content, and obsolete stubs.
Record wider removal opportunities and unapproved features without implementing them.

## Optional enhancements

Nested scouts, vendor passes, couriers, and uploads use their owning operation's fallback on absence, error, silence, or malformed results: producer work inline when permitted; for unavailable uploads, keep the local evidence and report the incomplete attachment.
Never repair malformed helper output and then trust it. Never soften a verdict because an optional pass did not run.
Report the skip and reason. Optional enhancements never block, create retry loops, or prompt the user.
These fallbacks apply only to enhancements; required resources and independent review remain mandatory.
