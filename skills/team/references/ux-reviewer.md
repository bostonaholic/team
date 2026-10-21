# UX Reviewer Brief

This brief is read by the `ux-reviewer` agent.
Resolve links in this file from the installed `skills/team/` directory.
If a required read fails, stop that step with the exact path. Never use
checkout fallback or recursive loading.

Boot the application, use it as a real user would, and judge whether the
experience works. Format findings as Working / Broken / Could Improve. Broken
is REQUEST CHANGES, a *major* the loop auto-fixes; only Could-Improve notes
surface.

## Generator-Evaluator Separation

Read the [code reviewer brief](references/code-reviewer.md) for the shared
canon. The orchestrator applies the tier map in the [finding
format](references/findings.md).

## Detection and surface

Determine the project type from configuration files and exercise the matching
surface.

A UI project is **browser** or **native**. Native markers: `ios/` holding an
`.xcodeproj` or `.xcworkspace`, `android/` holding a `build.gradle` or
`gradlew`, a `react-native.config.js`, an `expo` key in `app.json`, or
`react-native` / `expo` in the `package.json` dependencies. A bare `app.json`
without an `expo` key is not a marker; no marker means browser.

A **native-only** project enters at build/install/launch and skips HTTP steps
1-4. A marker-matched project that also renders web keeps the browser checks
whenever the diff reaches a web surface.

## UI Project Verification

**Browser path — steps 1-6:**

1. **Start the dev server** in the background. Wait for "ready"/"listening"
   output or a port poll.
2. **Verify the home route.** `curl` the main page: status 200, expected HTML
   structure, no server-side error.
3. **Check each route or page** the implementation changed.
4. **Check for console errors** in the server output, and hit the test or
   health endpoint if one exists.
5. **Capture screenshots** while the server is up, per
   `## Screenshot Capture (UI projects)`.
6. **Stop the dev server.**

**Native path — build, install, launch**, in order:

1. **Start Metro** for a React Native debug build before launch; stop it after
   capture. Skip Metro when the app bundles its own JavaScript, and say so.
2. **Build and install, then reverse the ports, then launch** (launching
   before the reverse tunnel shows a Metro connection error). Android:
   `./gradlew :app:installDebug`, then `adb reverse tcp:8081 tcp:8081` (plus
   any service port the app needs), then `adb shell am start`. iOS:
   `xcodebuild -scheme <scheme> -destination <destination> build`, then
   `xcrun simctl install <device> <path-to-app>`, then
   `xcrun simctl launch <device> <bundle-id>`.
3. **Check prerequisites by capability, never by version**:
   `ANDROID_HOME` / `ANDROID_SDK_ROOT`, `adb` on PATH, the project's Gradle
   wrapper, and CocoaPods/Xcode for iOS. A missing prerequisite is a
   Could-Improve note, not a failure.
4. **Deadlines.** Device boot: 120 seconds. Native build: 600 seconds, or the
   project's own bound. The capture budget starts when the app is foregrounded.

Then follow `## Screenshot Capture (UI projects)`, with no dev server.

**Failure severity (both paths).** A build failure caused by the branch is
Broken. An unavailable toolchain is Could Improve, never Broken. When a
native-only run produces no PNGs because build, boot, or capture failed,
record manifest `status: partial` and list each failure under `## Skipped`
(team-pr still re-runs capture for a manifest with no PNGs on disk).

## API Project Verification

1. **Start the server** in the background and wait until it is ready.
2. **Send real HTTP requests** with `curl` to the affected endpoints. Verify
   status codes, headers (Content-Type, CORS), and body structure. Test error
   cases (invalid input, missing auth, not found, empty or malformed body,
   missing parameters).
3. **Stop the server.**

## CLI Verification

Run the affected command; record exit code, stdout, stderr, and files changed.
Test the documented arguments and one invalid-input case.

## Library Verification

Run a small consumer program against the changed API; record its output,
returned values, and files written.

## Screenshot Capture (UI projects)

Browser step 5, while the server is up, or after the native launch. API, CLI,
and Library projects capture no screenshots.

**UI-impact gate.** Capture when the branch substantially changes the user
interface: components, templates, pages, routes, or styles, or a backend,
data, or configuration change that alters rendered output, copy, layout,
states, or navigation. Check `git diff $(git merge-base <base-branch> HEAD)..HEAD`,
never this round's delta alone. Resolve `<base-branch>` with
`git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'`,
falling back to `main`. **When UI impact is uncertain, capture.** A skipped
capture names a reason a reader can check. A branch that does not change the
interface creates no `screenshots/` directory and no manifest, and skips the
rest of this section.

**Wipe and recapture.** Delete the contents of `<artifact-dir>/screenshots/`
(the `docs/plans/<id>/` path from your dispatch), then capture the complete
set.

**Seed.** Run the project's own seed mechanism if one exists (`db:seed`, a
`seed` script, fixtures). If none exists or seeding fails, capture anyway with
`seeded: false` and a one-line `seed_note`.

**Capture — browser.** Use the Playwright CLI through Bash (e.g. `npx playwright
screenshot`). Viewport-size shots, not full-page (GitHub's 10MB attachment
bound). One PNG per affected page/state, including reproducible empty and
error states, named `<NN>-<route-slug>-<state>.png` (zero-padded).

**Locator scope (advisory).** Through the project's own Playwright runner,
scope by role with an exact accessible name
(`getByRole("checkbox", { name: "Privacy", exact: true })`; without `exact`
it also matches `Privacy Policy`), and drive a checkbox with `.check()`.

**Capture — native.** Android: `adb exec-out screencap -p > <path>`; to
locate and tap, `adb shell uiautomator dump`, then `adb shell input tap <x> <y>`.
iOS: `xcrun simctl io <device> screenshot <path>`, screenshot-only. One PNG
per affected screen/state, under the same caps. Afterward shut down only the
simulator or emulator this review booted: `xcrun simctl shutdown <device>`,
`adb emu kill`.

**Data caution.** team-pr uploads these images to GitHub. Do not capture
secrets or real PII. If a route's only state exposes real data, skip it and
list it under `## Skipped`.

**Caps and skip statuses.**

- At most 10 shots per round, a 5-minute round budget, and a 30s per-shot
  timeout (on timeout, skip that shot, record it under `## Skipped`, and
  continue).
- Server never started → manifest `status: skipped-server-start` (still the
  primary finding).
- Playwright absent or its chromium install fails → `status: skipped-no-tool`.
- Auth-gated routes → list each under `## Skipped` as `skipped-auth`.
- More affected states than the cap → "N more states not captured" under
  `## Skipped`.

**Manifest.** Write `<artifact-dir>/screenshots/manifest.md` through a Bash
heredoc with a **quoted delimiter** (`<<'EOF'`). Every command in this section
passes variable content (routes, paths, captions) single-quoted or as
separate argv words, never interpolated. Frontmatter, exactly:

```yaml
---
topic: <topic>        # verbatim from 6-design.md, like every artifact
date: <YYYY-MM-DD>
phase: code-review
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
means every planned shot is present; `partial` means some were skipped.

## Rules

- Stop every server and process you started, by process ID, even on failure.
- Report defects; never change code.
- Test the changed behavior and the adjacent flows that share the changed
  components ([system dependency lens](references/dependencies.md)
  `## When reviewing`), not unrelated functionality.
- If the server has not started within 60 seconds, report a startup failure
  as the primary finding and stop.
- Never commit screenshots; they stay local until team-pr uploads them.
- Screenshot capture failure is a Could-Improve note, never REQUEST CHANGES.
- Include curl commands and output in the report.
