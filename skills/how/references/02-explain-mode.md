## Explain mode

1. **Assess complexity.** A single module, one utility, or a narrow
   "how does function X work" is **simple**. A subsystem spanning many
   files or services, a cross-cutting feature flow, or a full
   architectural overview is **complex**. When in doubt, lean simple —
   you can still fan out later if you hit a wall.

2. **Simple: explore inline.** Trace the code yourself with Read, Grep,
   and Glob, then write the explanation per `## Output format`. Read the
   actual implementation; never guess from file names.

3. **Complex: fan out explorers.** Decompose the question into 2–4
   non-overlapping angles — distinct slices such as *data model and
   state*, *request path and enforcement*, *configuration and
   observability*. Dispatch one explorer per angle, all **in one
   message**, through the `Agent` tool with `subagent_type: Explore` —
   the built-in read-only type — and `model: sonnet`. Each prompt carries
   the `### Explorer brief` below, the question, and its assigned angle.

   If the `Agent` tool or the `Explore` type is unavailable, explore
   every angle yourself inline — the fan-out is an optimization, never a
   dependency (`principle-optimization-never-dependency`).
   Never substitute a full-tool agent silently.

4. **Synthesize.** Merge the explorers' findings into one coherent
   picture: reconcile overlaps, resolve contradictions by checking the
   code yourself, and weave the slices together. Reference specific
   files and functions so the reader can go look — the evidence bar for
   claims about code is a `file:line` citation, per
   `skills/researching-codebases/SKILL.md`. Acknowledge any gap an
   explorer flagged instead of papering over it. Then write the
   `## Output format`.

### Explorer brief

> Pass everything in this section to each read-only `Explore` subagent
> as part of its prompt. It is written in the second person, addressed
> to that subagent.

You are exploring a codebase to establish how one slice of a subsystem
works. Other explorers cover different slices in parallel — focus on
your assigned angle and go deep. Gather facts for a separate
synthesizer: favor thoroughness and accuracy over prose. You are
read-only: never write a file and never run a state-changing command.

1. **Find the entry point.** What triggers this behavior — a user
   action, an API call, a scheduled job?
2. **Trace the flow.** Follow the call chain; read each function;
   understand what data flows through and how it transforms.
3. **Map the key abstractions.** The central types, interfaces, and
   services — read their definitions, understand what each represents.
4. **Find the boundaries.** Where this slice interfaces with the rest:
   what goes in, what comes out.
5. **Note the non-obvious.** Anything surprising, historically shaped,
   or easy for a newcomer to get wrong.

Read the code — never infer behavior from a file name. Keep tracing
until you can describe the full path from trigger to effect without
hand-waving; where you cannot, say so explicitly rather than inventing
the connection.

Return your findings under these headings, and nothing else:
**Components Found** (name, path, one-line role) · **Flow** (step by
step, with files and functions) · **Files Read** · **Boundaries** ·
**Non-Obvious Things** · **Open Questions** (what you could not trace).
