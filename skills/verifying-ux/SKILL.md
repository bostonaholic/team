---
name: verifying-ux
description: Verify changed UI, API, or CLI behavior in a live application without editing code.
user-invocable: false
---

# Verifying UX

## Detect

Inspect manifests and routes:

- **UI:** frontend pages/components/routes render HTML.
- **API-only:** HTTP API or CLI, no UI.
- **Library:** no runnable server; report live verification not applicable.

## Required actions

For UI or API projects:

1. Discover the normal start command from the manifest, Makefile, or equivalent.
2. Start in the background. Wait for readiness, but no longer than 60 seconds.
3. Exercise only changed behavior with real `curl` requests. Record commands
   and output. Check status, content type/headers, body shape, and relevant
   empty-body, malformed-input, missing-parameter, not-found, and auth cases.
4. For UI, check the home and every affected route for expected HTML and server
   errors. Inspect server output and any health endpoint for errors. Then
   capture screenshots below while the server remains running.
5. ALWAYS stop the dev server, including on failure.

A server-start failure is the primary finding; stop verification after cleanup.
Never edit code.

## Screenshot capture

Run only when both conditions hold: this is a UI project **and** the branch's
full diff touches components, templates, pages, routes, or styles. Use
`git diff $(git merge-base <base-branch> HEAD)..HEAD`, resolving base from
`git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'`
with `main` fallback. If either condition fails, create neither `screenshots/`
nor a manifest.

Delete existing `<artifact-dir>/screenshots/` contents before capture. Every
review round recaptures the full affected set, not only that round's delta.

- Run a discovered seed/fixture mechanism. If absent or failed, continue with
  `seeded: false` and a one-line `seed_note`.
- Use Playwright CLI through Bash. Capture viewport PNGs, one per affected
  page/state, including reproducible empty/error states. Name them
  `<NN>-<route-slug>-<state>.png` in stable order.
- Never capture secrets or real PII. Prefer synthetic data; otherwise skip and
  explain under `## Skipped`.
- Cap at 10 shots, a 5-minute round, and a 30s per-shot timeout. Continue after
  shot timeouts. Auth-gated routes use `skipped-auth`. If the cap excludes
  states, write `N more states not captured`.

Write `<artifact-dir>/screenshots/manifest.md` with a quoted heredoc delimiter
(`<<'EOF'`). Pass routes, paths, captions, and other variable data as
single-quoted or separate argv values; never interpolate them into a command
string.

```yaml
---
topic: <topic>
date: <YYYY-MM-DD>
phase: implement
round: <n>
status: captured | partial | skipped-server-start | skipped-no-tool
seeded: true | false
seed_note: <one line; omit when seeded>
---
```

Body contract:

```markdown
## Captured

### <NN>-<route-slug>-<state>.png
- route: <URL path>
- state: <populated | empty | error>
- caption: <one sentence>

## Skipped
- <route/state>: <reason>
```

`captured` means every planned shot exists; `partial` means some skipped. A
server failure uses `skipped-server-start`; missing Playwright or Chromium uses
`skipped-no-tool`.

## Done

- Server is stopped.
- Report contains reproducible request commands/results.
- Screenshots stay local under the artifact directory; never commit them to
  any branch or worktree.
- Screenshot failure is Could Improve, never REQUEST CHANGES.
