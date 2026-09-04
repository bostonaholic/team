---
name: verifying-ux
description: 'Defines verifying ux methodology. Load when agents need its procedure.'
user-invocable: false
---

# Verifying UX

Boot and use the application as a user. Read
[references/procedure.md](references/procedure.md) before verification; it owns
the detailed UI/API checks, manifest body, skip handling, and report rules.

## Detection and lifecycle

- UI: rendered pages/components/routes. Start the dev server, wait until ready,
  use `curl` on home and changed routes, inspect errors, capture screenshots,
  then stop the server.
- API-only: start it, use real `curl` requests for success, headers, bodies,
  invalid input, missing auth/parameters, and not-found behavior, then stop it.
- Library: report live verification not applicable.

ALWAYS stop the dev server, including after failure. Do not change code or test
unrelated behavior. A server that is not ready within 60 seconds is the primary
finding. Keep commands and output for reproduction.

## Screenshot Capture (UI projects)

Capture while the server runs and only when both conditions hold: project type
is UI and the full branch diff touches components, templates, pages, routes, or
styles. Use `git diff $(git merge-base <base-branch> HEAD)..HEAD`; resolve base
with `git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'`,
fallback `main`. Otherwise create no screenshots directory or manifest.

Wipe `<artifact-dir>/screenshots/` before capture. Seed with the project's
mechanism when available; otherwise capture with `seeded: false` and `seed_note`.
Use Playwright CLI through Bash. Capture viewport PNGs for affected populated,
empty, and error states as `<NN>-<route-slug>-<state>.png`.

Never capture secrets or real PII. Skip auth-only routes. Limits: 10 shots per
round, 5-minute total, 30s per-shot timeout. Record timeouts and continue.
Screenshot failure is Could Improve, never REQUEST CHANGES.

Statuses:

- `captured`: every planned shot exists.
- `partial`: some shots skipped.
- `skipped-server-start`: server unavailable.
- `skipped-no-tool`: Playwright or Chromium unavailable.

Write `<artifact-dir>/screenshots/manifest.md` with a quoted heredoc delimiter
(`<<'EOF'`). Pass every variable route, path, caption, and note as a separate or
single-quoted argument; never interpolate into a command string.

```yaml
---
topic: <topic>
date: <YYYY-MM-DD>
phase: implement
round: <n>
status: captured | partial | skipped-server-start | skipped-no-tool
seeded: true | false
seed_note: <one line when needed>
---
```

Body requires `## Captured` with one `### <filename>` per shot and bullets
`route:`, `state: populated | empty | error`, and `caption:`. `## Skipped` lists
each skipped state and reason (`skipped-auth`, timeout, tool, or seed issue).
When capped, add `N more states not captured`.

Never commit screenshots to any branch or worktree. They remain local under
`docs/plans/<id>/screenshots/` until `team-pr` uploads them.
