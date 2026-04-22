# Task: simplify-orchestration

## Description

> "improve this claude code plugin by removing the teamflow UI and the event
> log file reading and writing; find a more efficient way to orchestrate the
> QRSPI pipeline"

The user wants to remove two infrastructure components from the TEAM plugin:

1. The Teamflow dashboard (`teamflow/` — a Svelte 5 + Fastify UI that tails
   `~/.team/<topic>/events.jsonl` and streams state to a browser via SSE).
2. The event log file I/O — the append-only `~/.team/<topic>/events.jsonl`
   that is the current source of truth for pipeline state, read and written
   by the router skill and both runtime hooks (`pre-compact-anchor.mjs`,
   `session-start-recover.mjs`).

The user also wants the pipeline orchestration to become more efficient in the
process — the current scheme requires disk I/O on every loop iteration.

## Stated goal

Remove the Teamflow UI and the event-log file substrate, replacing them with
a more efficient orchestration mechanism for the QRSPI pipeline.

## Inferred goal

Simplify the plugin to its essential coordination logic: agents, registry,
gates, and artifact files in `docs/plans/` — without a separate UI process
or a file-based event store that must be read on every routing step. The
router likely becomes an in-memory loop or delegates state-tracking entirely
to what survives across compaction (the `docs/plans/` artifacts and the
agent conversation context).

## Acceptance signals

- `teamflow/` directory is removed or archived; no Svelte, Fastify, or SSE
  code ships with the plugin.
- `~/.team/<topic>/events.jsonl` is no longer created or required at runtime.
- `lib/events.mjs` is either removed or repurposed to serve only the hooks
  that remain.
- `hooks/pre-compact-anchor.mjs` and `hooks/session-start-recover.mjs` still
  provide compaction defense and resume, using whatever new state substrate
  exists.
- The QRSPI pipeline still runs end-to-end: all 8 phases, both human gates,
  parallel research, aggregate verification gate.
- `/team-resume` still works after context compaction or session interruption.
- The plugin is distributed without any UI build step or Node dependency
  tree from the Teamflow server.

## Open assumptions

- The `docs/plans/` file artifacts (task, questions, brief, research, design,
  structure, plan) are retained as the durable inter-agent communication
  protocol; only the event log is being removed.
- The registry.json wiring model is retained; only the file-based event store
  is replaced.
- Resume-after-compaction must still work, so some compaction anchor
  mechanism is needed even without an event log.
- If beads is considered as an alternative state substrate, its schema and
  query model need to be confirmed.
