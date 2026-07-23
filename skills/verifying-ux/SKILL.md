---
name: verifying-ux
description: Live application verification procedure for the ux-reviewer agent — detect the project type (UI, API-only, or library), boot the application, exercise it with real requests, and evaluate the experience. Loaded when an implementation needs live smoke verification.
user-invocable: false
---

# Verifying UX

The ux-reviewer's procedure: boot the application, interact with it as a
real user would, and evaluate whether the experience works correctly.

## Detection

First, determine the project type by inspecting configuration files:

- **UI project:** Has a frontend framework (React, Vue, Svelte, Next.js, etc.)
  with pages, components, or routes that render HTML.
- **API-only project:** Has HTTP endpoints but no user-facing UI (REST API,
  GraphQL, CLI tool).
- **Library:** No runnable server. Skip live testing and report that live
  verification is not applicable.

## UI Project Verification

1. **Start the dev server.** Find the appropriate start command from
   `package.json` scripts, `Makefile`, or equivalent. Run it in the background.
   Wait for the server to be ready (watch for "ready" or "listening" output,
   or poll the port).

2. **Verify the home route.** Use `curl` to fetch the main page. Check that:
   - The response status is 200
   - The response body contains expected HTML structure
   - No server-side error messages are present

3. **Check relevant pages.** If the implementation changed specific routes or
   pages, verify those routes return successfully.

4. **Check for console errors.** If the project has a test or health endpoint,
   hit it. Look for error indicators in the server output.

5. **Stop the dev server** when verification is complete.

## API Project Verification

1. **Start the server.** Find and run the appropriate start command in the
   background. Wait for it to be ready.

2. **Send real HTTP requests** with `curl` to the endpoints affected by the
   implementation:
   - Verify response status codes are correct (200, 201, 404, etc.)
   - Verify response headers (Content-Type, CORS, etc.)
   - Verify response body structure matches expectations
   - Test error cases (invalid input, missing auth, not found)

3. **Check edge cases:**
   - Empty request bodies where a body is expected
   - Malformed input
   - Missing required parameters

4. **Stop the server** when verification is complete.

## Rules

- ALWAYS stop the dev server when you are done, even if verification fails.
  Use process IDs or `kill` to ensure cleanup.
- Do NOT modify any code. You are a tester, not a fixer.
- Do NOT test functionality unrelated to the recent implementation.
- If the server fails to start, report that as the primary finding and stop.
- Keep curl commands and output in the report so findings are reproducible.
- Time-bound your verification. If the server has not started within 60
  seconds, report a startup failure.
