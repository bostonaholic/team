Resolve these links from the installed `SKILL.md` directory. If a read fails, stop and report its resolved path.

## Stage and shoot

Every command below expands its variables as quoted `"$VAR"` words. A route, a
label, or a fill value reaches the shot list through `jq --arg`, never through
shell source ([external-data rules](../team/references/external-data.md)).

1. **Resolve the tools.** First bind `RUN_DIR="$(mktemp -d)"`, which holds
   every temporary this run writes. `shoot.mjs` loads Playwright from
   `$PAPARAZZI_TOOLS`, then from the project. When neither resolves, install it
   into a cache, never into the project:

   ```bash
   export PAPARAZZI_TOOLS="${XDG_CACHE_HOME:-$HOME/.cache}/team-paparazzi"
   npm install --prefix "$PAPARAZZI_TOOLS" --no-audit --no-fund playwright@1
   npx --prefix "$PAPARAZZI_TOOLS" playwright install chromium
   ```

   A failed browser download is not fatal, because `shoot.mjs` falls back to an
   installed Google Chrome and reports which browser it used. A native project
   needs `adb` or `xcrun simctl` instead, per the brief.

2. **Start the after app**, unless `--url` names it. Find the start command
   and its readiness signal with the brief's
   [browser steps 1-2](../code-review/references/ux-reviewer.md#ui-project-verification),
   bind it to `127.0.0.1` on a free port, and record its PID. The after app
   runs from the user's checkout as it stands. When its command writes build
   output into the checkout, such as Jekyll's `_site`, point that output under
   `$RUN_DIR`, so it cannot collide with a server the user already runs.

   ```bash
   free_port() { node -e 'const s = require("net").createServer().listen(0, "127.0.0.1", () => { console.log(s.address().port); s.close(); })'; }
   ```

3. **Start the before app**, unless the run is after-only.

   ```bash
   BEFORE_DIR="$RUN_DIR/before"
   git worktree add --detach "$BEFORE_DIR" "$MERGE_BASE"
   ```

   - When no dependency manifest or lockfile differs between `$MERGE_BASE` and
     the working tree, symlink the checkout's installed dependencies, such as
     `node_modules` or `vendor/bundle`, into the worktree. Otherwise run the
     project's install command inside the worktree.
   - Symlink, never copy, the untracked local configuration the after app
     reads, such as `.env`, so both sides run with the same settings.
   - Start it with the after app's command on its own free port, and record
     its PID.
   - A before app that fails to build or start, or a branch that migrates the
     database both apps share, drops the run to after-only. Report the first
     line of the error. Never repair the base.

4. **Seed once**, for both apps, with the brief's `**Seed.**` rule. Apps that
   share one database then render the same data on both sides.

5. **Write the shot list** from the plan, with the live origins, into
   `$RUN_DIR`. Bind every value a caller or a page supplied as its own `--arg`:

   ```bash
   jq -n --arg before "$BEFORE_ORIGIN" --arg after "$AFTER_ORIGIN" \
     --arg path "/settings" --arg button "Edit profile" '{
     origins: {before: $before, after: $after},
     shots: [{name: "01-settings-populated-edit", path: $path,
              actions: [{click: {role: "button", name: $button}}]}]
   }' >"$RUN_DIR/shots.json"
   ```

6. **Clear the previous run, then shoot.** In `$OUT`, delete only
   `manifest.md` and PNGs named `NN-…-before.png` or `NN-…-after.png`. Anything
   else there belongs to someone else and stays. Then:

   ```bash
   node "<skill-dir>/scripts/shoot.mjs" "$RUN_DIR/shots.json" "$OUT" >"$RUN_DIR/shoot.json"
   ```

   | Exit | Means | Do |
   | --- | --- | --- |
   | 0 | Every frame passed its gates and every pair changed | Verify |
   | 1 | A frame failed or a pair is identical, each named in the report | Verify. The failures are handled there |
   | 2 | The shot list is unusable, and nothing launched | Fix the list from the stderr message and rerun. This is not a retake |
   | 3 | No Playwright and no browser | Record `status: skipped-no-tool`, tear down, and report |

   `shoot.json` stays in `$RUN_DIR`, never in `$OUT`, which ends up holding only
   what the manifest lists.

7. **Native screens.** Build, launch, and capture with the brief's
   [native path](../code-review/references/ux-reviewer.md#ui-project-verification)
   and its capture commands, one PNG per frame named `<name>-after.png`. A
   before side for native needs a second build from the worktree, so shoot one
   only when the user asks for it. Gate each frame with
   `node "<skill-dir>/scripts/png-check.mjs" <png> [--against <before-png>]`,
   which exits 0 on a pass, 1 on a failed gate named in `failures`, and 2 on an
   unreadable file.

8. **Tear down, always**, including after a failure. Stop every server this run
   started by its recorded PID and never by name. Run
   `git worktree remove --force "$BEFORE_DIR"`. Shut down only a device this run
   booted, as the brief's `**Device shutdown.**` rule states.
