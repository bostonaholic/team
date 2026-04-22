# Research Questions: simplify-orchestration

## Topology

- What directories and files make up the Teamflow subsystem, and which of
  those files are imported by components outside `teamflow/`?
- Which runtime files import from `lib/events.mjs`, and for what purposes
  does each consumer use it?
- Which runtime hooks (`hooks/*.mjs`) read or write `~/.team/<topic>/events.jsonl`,
  and what specific fields from the event log do they depend on?
- What does `skills/team/SKILL.md` do step-by-step with the event log during
  the router loop — specifically, which loop steps require a file read and
  which require a file write?
- Does `skills/team-resume/SKILL.md` have any logic that cannot function
  without the JSONL event log as its input?

## Conventions

- What is the existing pattern for persisting durable state across compaction
  events in this codebase (outside of the event log)?
- How does `hooks/pre-compact-anchor.mjs` construct its `additionalContext`
  payload — which fields does it extract from the event log, and which fields
  could be sourced from elsewhere?
- How does `hooks/session-start-recover.mjs` determine whether a pipeline is
  active and at what phase — what is the minimal state it needs to answer
  those questions?
- What conventions does the codebase use for agent-to-router communication:
  do agents write files themselves, or does the router always persist on their
  behalf?

## Constraints

- What types, interfaces, or schemas in `teamflow/src/types.ts` and
  `teamflow/src/state.ts` are referenced outside the `teamflow/` tree?
- What does `skills/team/registry.json` define (agents, gates, joins, phases),
  and which of those definitions currently presuppose an append-only event log?
- What invariants does the router enforce about event sequencing (gapless seq,
  single writer, no deletion) and which of those are structural vs. merely
  documented conventions?
- Are there any `.claude-plugin/` or distributed manifest files that reference
  the Teamflow server, its port, or its startup command?

## Reference points

- What is the most minimal hook in `hooks/` — the one with the fewest external
  dependencies — and how does it avoid relying on the event log?
- What existing pattern does `hooks/post-write-validate.mjs` use for stateless
  structural validation that does not touch `~/.team/`?
- What state does `deriveState()` in `lib/events.mjs` return, and which fields
  of that state are actually consumed by the hooks vs. only by Teamflow?
- Among the partial-skill entry points (`skills/team-question/`,
  `skills/team-research/`, etc.), which ones currently scan `events.jsonl`
  to determine prerequisites, and which operate solely from `docs/plans/`
  artifact presence?
