Before dispatch, resolve [focused work](../team/principles/focused-work.md). Pass their absolute installed paths with the retained brief.
The receiver reads them before work. Missing resources stop that step with the exact path, without source fallback.

## Explain mode

1. **Assess complexity.** A single module, one utility, or a narrow
   "how does function X work" is **simple**. A subsystem spanning many
   files or services, a cross-cutting feature flow, or a full
   architectural overview is **complex**. When in doubt, lean simple —
   you can still fan out later if you hit a wall.

2. **Simple: explore inline.** Trace the code yourself with Read, Grep,
   and Glob, then write the explanation per `## Output format`. Read the
   actual implementation; never guess from file names.

3. **Complex: fan out explorers.** Split the question into 2–4
   non-overlapping angles. Dispatch one explorer per angle, all **in one
   message**, through the `Agent` tool with `subagent_type: Explore` —
   the built-in read-only type — and `model: sonnet`. Each prompt carries
   the `### Explorer brief` below, the question, and its assigned angle.
   If the `Agent` tool or the `Explore` type is unavailable, explore
   every angle yourself inline — the fan-out is an optimization, never a
   dependency ([focused work rules](../team/principles/focused-work.md)).
   Never substitute a full-tool agent silently.

4. **Synthesize.** Resolve contradictions by checking the code yourself.
   Claims about code carry a `file:line` citation, per the
   [research playbook](../../team/playbooks/research.md). Acknowledge any
   gap an explorer flagged instead of papering over it. Then write the
   `## Output format`.

### Explorer brief

> Pass everything in this section to each explorer as part of its prompt.

You are exploring a codebase to establish how one slice of a subsystem
works. Other explorers cover different slices in parallel. Focus on your
assigned angle and go deep. Gather facts, not prose, for a separate
synthesizer. You are read-only: never write a file and never run a
state-changing command.

Read the code — never infer behavior from a file name. Keep tracing until
you can describe the full path from trigger to effect; where you cannot,
say so explicitly rather than inventing the connection.

Return your findings under these headings, and nothing else:
**Components Found** (name, path, one-line role) · **Flow** (step by
step, with files and functions, and what data flows through and how it
transforms) · **Files Read** · **Boundaries** (what goes in, what comes
out) · **Non-Obvious Things** (surprising, historically shaped, or easy
for a newcomer to get wrong) · **Open Questions** (what you could not
trace).
