# Installation-aware skill dispatch

Read this contract before invoking another Team command or offering continuation guidance.
Resolve links from the loaded SKILL.md directory. Keep the resolved runtime root and mode from startup or native dispatch.
If either is unavailable, stop and report the missing installed context. Never search the consumer checkout for Team source.

## Invoke Team skill

The machine identifier `Invoke Team skill` takes a public command or internal phase name, its arguments, and inherited authorization.
It means immediate execution only where the caller already authorizes that operation.

- For a `team-*` phase, read `<root>/skills/<name>/WORKFLOW.md` in either mode. These are internal procedures included with `team`, never independently registered or installed skills.
- For other commands in plugin mode, invoke the registered skill through the host's existing skill mechanism.
- For other commands in skills mode, read `<root>/skills/<name>/SKILL.md` and execute that canonical procedure with the original arguments and invocation context.
- Pass root and mode to nested calls and agents. Never initialize another runtime or resolve a sibling through host discovery.
- Preserve explicit-intent gates, standalone stops, artifacts, credentials, and consumer-project paths.
- If an operation needs unsupported host capabilities or reviewer enforcement, stop that operation and report the limitation.
- A bundled procedure grants no permission to install, advance, merge, publish, or run a guarded command.

## Continuations and recovery

A continuation is a suggestion, not an immediate invocation. Keep the caller's stop condition.
For an unselected sibling, offer an explicit same-session request with its name and arguments.
For an internal `team-*` phase, install `team` if needed: `npx skills add bostonaholic/team --skill team`.
Request `/team <phase> [arguments]`, dropping the internal `team-` prefix (for example, `/team question <description>`). Do not offer an individual phase install or slash command.
For a public utility, show `npx skills add bostonaholic/team --skill <name>` before a later slash invocation.
Never imply that an unselected slash command exists. Never auto-install or advance because a bundled procedure exists.
For the current command, resume its existing canonical procedure with the same root, mode, arguments, and recorded state.
Self-resume is not a recursive invocation. Citations and ordinary file reads are not invocations.

## Initialization boundary

Only the invoking root session may initialize its packaged runtime before workflow work.
This permits writes only inside that invocation's fresh private temporary directory and cleanup there after failed initialization.
Native resolution writes nothing. Subagents inherit the prepared root and mode and never initialize.
For read-only commands, project, installation, configuration, workflow, and external-service writes remain prohibited.
This exception changes no investigator or reviewer tool grants and grants no task execution to `agent-prompt`.
