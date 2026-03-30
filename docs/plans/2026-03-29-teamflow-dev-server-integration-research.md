# Research: Teamflow Dev Server Integration

## Tech Stack

- **Dev runner:** `dev` CLI with `dev.yml` — `up`, `check`, `commands` sections
- **Teamflow server:** Fastify 5 + TypeScript via `node --import tsx src/server.ts`
- **Frontend:** Svelte 5 + Vite, pre-built to `teamflow/dist/`
- **Event log:** Append-only JSONL at `<project>/.team/events.jsonl`, tailed every 300ms
- **Hooks:** Plain Node.js `.mjs` scripts

## Directory Conventions

| Path | Purpose |
|------|---------|
| `dev.yml` | Dev environment config — `up`, `check`, `commands` |
| `teamflow/bin/teamflow.mjs` | Launcher shim — spawns tsx on `src/server.ts` |
| `teamflow/bin/demo.mjs` | Demo runner — starts server AND writes fake events (coupled) |
| `teamflow/src/server.ts` | Fastify server: health, SSE, state, static |
| `teamflow/src/tail.ts` | File tailer polling events.jsonl every 300ms |
| `lib/events.mjs` | Shared event library used by hooks |
| `hooks/session-start-recover.mjs` | SessionStart hook — reads events, no server logic |
| `tests/teamflow-dashboard-tests.sh` | Acceptance tests T1–T19 |

## Relevant Code

**Current `dev.yml` commands block:**
```yaml
commands:
  demo:
    desc: "Start the Teamflow dashboard with a live demo pipeline (~60s)"
    run: "cd teamflow && npm install --silent && npm run demo"
```

**Server env vars** (`teamflow/src/server.ts` + `bin/teamflow.mjs`):
- `TEAMFLOW_PORT` — default `7425`
- `TEAMFLOW_NO_OPEN` — set to `1` to suppress browser auto-open
- `CLAUDE_PROJECT_DIR` — project root for locating `.team/events.jsonl`

**Health endpoint** (exists): `GET /api/health` → `{ status: "ok" }`

**Server npm script:** `node --import tsx src/server.ts`

## Key Files

### Source Files
- `dev.yml` — Current dev config, needs new `server` command
- `teamflow/bin/teamflow.mjs` — Launcher shim (41 lines)
- `teamflow/bin/demo.mjs` — Coupled server+event writer (135 lines), needs refactor
- `teamflow/src/server.ts` — Fastify entry point (81 lines), has `/api/health`
- `teamflow/src/tail.ts` — File tailer (118 lines)
- `teamflow/src/state.ts` — State engine (191 lines)
- `teamflow/src/sse.ts` — SSE broadcast plugin (58 lines)
- `teamflow/src/api.ts` — REST plugin (22 lines)
- `teamflow/package.json` — Dependencies, scripts
- `lib/events.mjs` — Shared event utilities (85 lines)
- `hooks/session-start-recover.mjs` — SessionStart hook (125 lines)

### Tests
- `tests/teamflow-dashboard-tests.sh` — 19 tests (T1–T19); T10–T14 test live server

### Documentation
- `docs/architecture.md` — Event store design
- `docs/plans/2026-03-28-teamflow-dashboard-plan.md` — Prior plan

## Patterns

1. `dev.yml` `commands` accept `run:` shell string — add new `server` command
2. Health check before start — `/api/health` already implemented
3. `demo.mjs` spawns server (`spawn("node", ["--import", "tsx", serverPath])`) then writes mock events — needs decoupling
4. `tail.ts` handles missing file gracefully — server can start before any pipeline runs
5. `TEAMFLOW_NO_OPEN=1` — must be set in dev server command

## Test Patterns

- Tests in `tests/teamflow-dashboard-tests.sh`, plain bash
- Server started in background with `&`, poll `nc -z 127.0.0.1 7425` up to 5s
- Hit `/api/health`, `/api/state`, `/api/events` with curl
- No tests yet for auto-start via `dev server` or health-check dedup

## Constraints

1. `teamflow/node_modules` must exist — `npm install` must run first
2. `dev.yml` commands are one-shot — server process blocks (foreground)
3. No built-in parallel process support in `dev.yml`
4. `demo.mjs` currently owns server startup — needs to detect existing server

## Open Questions

1. Should `dev server` block or daemonize? Current test pattern starts in background with `&`.
2. Should `demo` delegate to `dev server`? Cleanest: `dev server` starts server; `dev demo` checks health, starts if needed, then writes events.
3. `dev.yml` doesn't appear to have a `processes:` parallel section — `commands:` is the only mechanism.
4. How should new acceptance tests for auto-start be structured? (T20+)
5. Does `dev` support a `processes:` or parallel task section to start server alongside other tasks?
