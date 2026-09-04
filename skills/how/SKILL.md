---
name: how
description: 'Explains subsystem architecture and runtime flow. Trigger on "how does X work", "walk me through", "explain the architecture", or "/how".'
effort: medium
argument-hint: "[<subsystem, feature, or question>]"
---

# How — Architectural Explanation

Explore the codebase to answer "how does X work?" Produce the mental
model a senior engineer needs to start working in an unfamiliar
subsystem — the architecture, the flow, and the sharp edges. Not
annotated source code.

Companion to `skills/why/SKILL.md`: `how` answers what the code does and
how it works; `why` answers what forces led to its shape. When the user
asks about motivation, rejected alternatives, or history, that is `why`'s
job.

This skill is **read-only**. It writes no files, records no artifacts,
and changes no state — in this session and in every subagent it
dispatches.

Two modes:

1. **Explain** (default) — explore and produce a clear explanation.
2. **Critique** — explain first, then dispatch fresh-context critics to
   judge the architecture.

## Input

`$ARGUMENTS` is the question — a subsystem ("the rate limiter"), a
feature flow ("what happens when a user submits the form"), or a
placement question ("where should this validation live"). Two resolution
paths:

- **Given** — parse the target and scope directly from the argument.
- **Empty or vague** — infer the target from conversation context: open
  files, recent edits, what was just discussed. **State your
  interpretation in one line before exploring** so the user can redirect
  if you are off. Do not ask first; a stated best guess beats a
  questionnaire.

Choose the mode from the ask: a request for problems, issues, or
improvements ("critique the architecture", "what's wrong with this
design") selects Critique; everything else is Explain.

## Explain mode

> Follow `skills/principle-progress-tracking/SKILL.md`: when this procedure has two or more steps, seed one todo item per step before starting and mark each complete as you go.

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
   dependency (`skills/principle-optimization-never-dependency/SKILL.md`).
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

## Output format

Adapt to the question — not every section is needed every time.

- **Overview** — one or two paragraphs: what it is, what it does, why it
  exists. Enough to decide whether to keep reading.
- **Key Concepts** — the types, services, and abstractions needed to
  follow the rest. Brief definitions, not an inventory.
- **How It Works** — the core: what triggers it, what happens step by
  step, where data goes, the decision points. Prose, not pseudocode,
  citing files and functions. Add a mermaid diagram when the flow
  crosses several components and a diagram clarifies; skip it when
  prose covers the flow.
- **Where Things Live** — the file and directory map someone needs to
  start working here. Not every file.
- **Gotchas** — surprising behavior, historical residue, sharp edges.
  Omit when there is nothing worth calling out.

Concrete language throughout: "`UserService` calls
`AuthClient.refresh()`", never "the service delegates to the client".
When something is complex, explain why it is complex; when it is simple,
do not pad it.

## Critique mode

Explain first — run `## Explain mode` in full. You cannot judge an
architecture you have not established.

1. **Dispatch critics.** Three fresh-context critics, all **in one
   message**, through the `Agent` tool with `subagent_type: Explore` and
   `model: sonnet`, one lens each:
   - *Abstraction fit and boundary discipline* — does each abstraction
     earn its place; are boundaries where things change independently;
     is validation at entry points; could this be tested in isolation?
   - *Data model and complexity spend* — do the structures fit the
     access patterns; are types honest about runtime shapes; is
     complexity concentrated where the domain needs it or leaked into
     accidental places?
   - *Evolution readiness and consistency* — how much moves when the
     likely next requirement lands; which hardcoded assumptions would
     need relaxing; does this area follow the codebase's established
     patterns, and is any divergence explained?

   Each critic receives the explanation, the relevant file paths, and
   its lens; it reads the actual code and forms its own judgment — the
   explanation is a map, not the verdict. Each finding comes back rated
   **structural** (wrong boundary, broken model, coupling that blocks
   future work), **concern** (real friction, not fundamental), or
   **observation** (worth noting), with concrete code evidence — a
   dependency chain shown, never asserted. Architectural findings only:
   line-level review belongs to `code-review`, and a rewrite may not be
   suggested without a demonstrated problem. The critics get fresh
   context and no authorship stake — that separation is the point
   (`skills/principle-generator-evaluator/SKILL.md`). If dispatch is
   unavailable, run the three lenses yourself sequentially and say so.

2. **Judge as the lead.** You are a pragmatic lead, not an aggregator.
   Sort every finding into **Act on** (worth fixing now), **Consider**
   (real, unclear cost/benefit), **Noted** (valid, low priority), or
   **Dismissed** (wrong, missing context, or style preference — say
   which).

3. **Present.** The explanation first, standing on its own; the critique
   verdict below it. A reader who only wants to understand the system
   never wades through critique.

## Rules

- **Read-only.** No writes, no artifacts under `docs/plans/`, no
  state-changing commands, here or in any subagent.
- **Explain before critiquing.** Critique mode never skips the
  explanation.
- **Cite, don't gesture.** Claims about code carry `file:line`; a flow
  step names the function that runs it.
- When the question is about motivation or history rather than
  mechanics, call the Skill tool with `why` instead — mechanics and
  motivation are different investigations.
