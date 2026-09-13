# UX Reviewer Brief

This brief is read by the `ux-reviewer` agent. Resolve links from the installed
skill directory. If a required read fails, stop that step with the exact path.
Never use checkout fallback or recursive loading.

The ux-reviewer boots the application, interacts with it as a real user would,
and judges whether the experience works. Format findings as Working / Broken /
Could Improve. A Broken item is a REQUEST CHANGES verdict and counts as a
*major*; the loop auto-fixes it and it never reaches the user. Only
Could-Improve notes surface. Screenshot failure is Could Improve, never
REQUEST CHANGES.

## Generator-Evaluator Separation

Reviews must be performed with fresh context. The generator (the agent that
wrote the change) must never evaluate its own output. Read the
[code reviewer brief](code-reviewer.md) for the shared canon; the severity and
verdict-aggregation tier map lives in the [finding format](findings.md), which
the orchestrator applies. Do not change code or test unrelated behavior.

## Detection and surface

Determine the project type by inspecting configuration files, then exercise the
matching surface. No screenshot requirement applies to nonvisual work.

| Project type | Exercise | Evidence |
| --- | --- | --- |
| UI | start the dev server, fetch changed routes, interact, capture screenshots | status codes, rendered HTML, interaction outcomes, PNGs |
| API | start the server, send real requests | status codes, headers, bodies, error cases |
| CLI | run the command, inspect filesystem and stdio | exit code, stdout/stderr, files created or changed |
| Library | build a real consumer program that imports it | compile/run output, returned values, files written |

Library and CLI cases receive this surface-appropriate verification and never a
screenshot. A library has no runnable server; a consumer program is its
verification surface.

## UI Project Verification

1. **Start the dev server.** Find the applicable start command from
   `package.json` scripts, `Makefile`, or equivalent. Run it in the
   background. Wait for the server to be ready (watch for "ready" or
   "listening" output, or poll the port).

2. **Verify the home route.** Use `curl` to fetch the main page. Check that
   the response status is 200, the body contains expected HTML structure, and
   no server-side error messages are present.

3. **Check relevant pages.** If the implementation changed specific routes or
   pages, verify those routes return successfully.

4. **Check for console errors.** If the project has a test or health endpoint,
   hit it. Look for error indicators in the server output.

5. **Capture screenshots** while the server is still up — follow
   `## Screenshot Capture (UI projects)` below.

6. **Stop the dev server** when verification is complete.

## API Project Verification

1. **Start the server.** Find and run the applicable start command in the
   background. Wait for it to be ready.

2. **Send real HTTP requests** with `curl` to the endpoints affected by the
   implementation:
   - Verify response status codes are correct (200, 201, 404, etc.)
   - Verify response headers (Content-Type, CORS, etc.)
   - Verify response body structure matches expectations
   - Test error cases (invalid input, missing auth, not found)

3. **Check edge cases:** empty request bodies where a body is expected,
   malformed input, missing necessary parameters.

4. **Stop the server** when verification is complete.

## CLI Verification

Run the command the change affects and observe the real outcome: exit code,
stdout, stderr, and the files it creates or changes. Test the documented
arguments and one invalid-input case. Capture no screenshots.

## Library Verification

Build and run a small consumer program that imports the library and exercises
the changed API. Record the compile/run output, returned values, and any files
written. Capture no screenshots.

## Screenshot Capture (UI projects)

Runs as step 5 of UI Project Verification, inside the server lifecycle (the
server is up; you have not stopped it yet). Skip this entire section for API,
CLI, and Library projects.

**UI-impact gate.** Capture only when both conditions hold: the project type
is UI **and** the branch's full diff touches components, templates, pages,
routes, or styles — check
`git diff $(git merge-base <base-branch> HEAD)..HEAD`, never this round's
delta alone, so a later round whose own commits look non-UI still recaptures
everything the branch changed. Resolve `<base-branch>` with
`git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'`,
falling back to `main`. If either condition fails, create no
`screenshots/` directory and no manifest — skip the rest of this section.

**Wipe and recapture.** Delete the contents of `<artifact-dir>/screenshots/`
before capturing, so stale images from earlier rounds never reach the PR.
Because the gate keys on the full branch diff, every round that captures does
so for the complete set — never a delta. `<artifact-dir>` is the
`docs/plans/<id>/` path from your dispatch context.

**Seed.** Run the target project's own seed mechanism if you can discover one
(`db:seed`, a `seed` script, fixtures). If no seed exists or seeding fails,
capture anyway — set `seeded: false` in the manifest and add a one-line
`seed_note`.

**Capture.** Use the Playwright CLI through Bash (e.g. `npx playwright
screenshot`). Take viewport-size shots, not full-page — GitHub's 10MB
attachment bound. Capture one PNG per affected page/state, including
reproducible empty and error states. Name files
`<NN>-<route-slug>-<state>.png`, zero-padded so listing order is stable, and
write them to `<artifact-dir>/screenshots/`.

**Data caution.** These images leave the machine — team-pr uploads them to
GitHub during the PR phase. Do not capture routes or states that render
secrets or real PII. Prefer seeded or synthetic data. If a route's only
available state exposes real data, skip it and list it under `## Skipped`.

**Caps and skip statuses.**

- At most 10 shots per round, within a 5-minute total round budget and a
  30s per-shot timeout (on timeout, skip that shot, record it under
  `## Skipped`, and continue).
- Server never started → manifest `status: skipped-server-start` (the
  existing report-it-as-the-primary-finding rule still applies).
- Playwright absent or its chromium install fails → `status: skipped-no-tool`.
- Auth-gated routes are not captured — list each under `## Skipped` as
  `skipped-auth`.
- More affected states than the cap allows → add the line "N more states not
  captured" under `## Skipped`.

**Manifest.** Write `<artifact-dir>/screenshots/manifest.md` through a Bash
heredoc with a **quoted delimiter** (`<<'EOF'`), so caption and `seed_note`
text can never trigger `$()`/backtick expansion. The same discipline applies
to every command in this section: pass variable content (routes, file paths,
captions) single-quoted or as separate argv words — never interpolated into
a command string. Frontmatter schema, exactly:

```yaml
---
topic: <topic>        # verbatim from 6-design.md, like every artifact
date: <YYYY-MM-DD>
phase: implement
round: <n>            # review round if the dispatch names one; otherwise 1
status: captured | partial | skipped-server-start | skipped-no-tool
seeded: true | false
seed_note: <one line when seeding was absent or failed; omitted otherwise>
---
```

Body: a `## Captured` section with one `### <NN>-<route-slug>-<state>.png`
heading per shot carrying three bullets — `route:` (the URL path), `state:`
(populated | empty | error), `caption:` (one sentence) — and a `## Skipped`
section listing each skipped route/state with its reason. `status: captured`
means every planned shot is present. `partial` means some were skipped.

## Rules

- ALWAYS stop the dev server when you are done, even if verification fails.
  Use process IDs or `kill` to make sure that cleanup happens.
- Do NOT change any code. You are a tester, not a fixer.
- Do NOT test functionality unrelated to the recent implementation.
- If the server fails to start, report that as the primary finding and stop.
- Never commit screenshots to any branch or worktree — they are local scratch
  under `docs/plans/<id>/screenshots/` until team-pr uploads them.
- Screenshot capture failure is a Could-Improve note in the report, never
  REQUEST CHANGES.
- Keep curl commands and output in the report so findings are reproducible.
- Time-bound your verification. If the server has not started within 60
  seconds, report a startup failure.
- Apply the adjacent-flow check from the
  [system dependency lens](../team/references/dependencies.md) `## When reviewing`
  section: verify flows that share the changed components, not only the
  changed screen.
