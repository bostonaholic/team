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

2. **Start the app** unless `--url` names it. Find the start command and its
   readiness signal with the brief's
   [browser steps 1-2](../code-review/references/ux-reviewer.md#ui-project-verification),
   bind it to `127.0.0.1` on a free port, and record its PID. It runs from the
   user's checkout as it stands. When its command writes build output into the
   checkout, such as Jekyll's `_site`, point that output under `$RUN_DIR`, so it
   cannot collide with a server the user already runs. An app that never
   becomes ready is `status: skipped-server-start`: report the first line of
   its error, tear down, and stop.

   ```bash
   free_port() { node -e 'const s = require("net").createServer().listen(0, "127.0.0.1", () => { console.log(s.address().port); s.close(); })'; }
   ```

   An app at `--url` is shot as it serves, which lags the checkout when its
   server does not rebuild on change. When a frame shows that lag, the report
   says so.

3. **Seed once** with the brief's `**Seed.**` rule, when a state needs data.

4. **Write the shot list** from the plan, with the live origin, into
   `$RUN_DIR`. Bind every value a caller or a page supplied as its own `--arg`:

   ```bash
   jq -n --arg origin "$APP_ORIGIN" --arg path "/settings" --arg button "Edit profile" '{
     origin: $origin,
     shots: [{name: "01-settings-populated-edit", path: $path,
              actions: [{click: {role: "button", name: $button}}]}]
   }' >"$RUN_DIR/shots.json"
   ```

5. **Clear the previous run, then shoot.** In `$OUT`, delete only
   `manifest.md` and the PNGs it lists as `### <file>` entries. Anything else
   there belongs to someone else and stays. Then:

   ```bash
   node "<skill-dir>/scripts/shoot.mjs" "$RUN_DIR/shots.json" "$OUT" >"$RUN_DIR/shoot.json"
   ```

   | Exit | Means | Do |
   | --- | --- | --- |
   | 0 | Every frame passed its gates | Verify |
   | 1 | A frame failed, named in the report | Verify. The failures are handled there |
   | 2 | The shot list is unusable, and nothing launched | Fix the list from the stderr message and rerun. This is not a retake |
   | 3 | No Playwright and no browser | Record `status: skipped-no-tool`, tear down, and report |

   `shoot.json` stays in `$RUN_DIR`, never in `$OUT`, which ends up holding only
   what the manifest lists.

6. **Native screens.** Build, launch, and capture with the brief's
   [native path](../code-review/references/ux-reviewer.md#ui-project-verification)
   and its capture commands, one PNG per frame named `<name>.png`. Gate each
   frame with `node "<skill-dir>/scripts/png-check.mjs" <png>`, which exits 0
   on a pass, 1 on a failed gate named in `failures`, and 2 on an unreadable
   file.

7. **Tear down, always**, including after a failure. Stop every server this run
   started by its recorded PID and never by name. Shut down only a device this
   run booted, as the brief's `**Device shutdown.**` rule states.
