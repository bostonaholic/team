# Brief: simplify-orchestration

## Topic

simplify-orchestration

## Scope

The codebase areas under investigation:

- `lib/events.mjs` — shared event parsing and log I/O library
- `hooks/pre-compact-anchor.mjs` — PreCompact hook, imports `lib/events.mjs`
- `hooks/session-start-recover.mjs` — SessionStart hook, imports `lib/events.mjs`
- `hooks/post-write-validate.mjs` — PostToolUse(Write|Edit) hook
- `hooks/pre-bash-guard.mjs` — PreToolUse(Bash) hook
- `skills/team/SKILL.md` — router skill (event loop, gate handling)
- `skills/team/registry.json` — pipeline wiring (agents, gates, joins)
- `skills/team-resume/SKILL.md` — pipeline recovery skill
- `skills/team-*/SKILL.md` — partial entry-point skills
- `teamflow/` — dashboard server and UI (Fastify + Svelte 5 + SSE)
- `teamflow/src/state.ts` — state engine that consumes the event log
- `teamflow/src/types.ts` — shared TypeScript types
- `teamflow/bin/teamflow.mjs` — server entry point
- `teamflow/bin/demo.mjs` — synthetic pipeline demo
- `.claude-plugin/plugin.json` — distributed plugin manifest

## Vocabulary

- **event log**: the append-only JSONL file at `~/.team/<topic>/events.jsonl`
  that records every state transition in a pipeline run
- **router**: the `team` skill; drives the pipeline by reading the event log
  and dispatching agents based on `registry.json`
- **registry**: `skills/team/registry.json`; defines which agent consumes
  which event, gate types, and parallel join conditions
- **gate**: a checkpoint between pipeline phases; types are `human`,
  `mechanical`, `router-emit`, and `aggregate`
- **compaction**: Claude Code's context-window compaction event; the
  PreCompact hook injects a pipeline summary to survive it
- **session recover**: the SessionStart hook's behavior of scanning the event
  log to reconstruct pipeline position after a session restart
- **deriveState**: the function in `lib/events.mjs` that reduces an event
  array to a structured pipeline state object
- **Teamflow**: the local Fastify + Svelte 5 dashboard that tails the event
  log and streams state to a browser via SSE
- **artifact**: a file written to `docs/plans/` during a pipeline phase;
  the durable inter-agent communication substrate
- **blind research**: the invariant that `researcher` and `file-finder` agents
  never receive the user's original task description

## Adjacent areas (out of scope but may be referenced)

- `docs/plans/` — artifact files written by agents during each phase
- `agents/*.md` — agent system prompts with `consumes`/`produces` frontmatter
- `skills/*/SKILL.md` — methodology skills loaded by agents
- `.claude/hooks/check-registry-sync.mjs` — dev-only hook (not distributed)
- `docs/beads-workflow.md` — issue tracking workflow
