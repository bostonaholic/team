---
topic: phaser-office-demo
date: 2026-05-28
phase: plan
---

# Plan: phaser-office-demo

## Context

Replace the Jekyll site under `docs/` with a no-build Phaser 3 demo
served at `team.bostonaholic.dev`. The approved structure
(`docs/plans/2026-05-28-phaser-office-demo/structure.md`) breaks the
work into 8 atomic slices: rescue + teardown, static shell + CDN,
asset generator, player, NPCs + desks, NPC patrol, name labels, then
`package.json` / README / `dev.yml` finalization. Phaser ships via
jsDelivr CDN with an SRI hash; `docs/.nojekyll` tells GitHub Pages to
serve files verbatim. The 13 agent names come verbatim from
`skills/team/registry.json`.

## Slices

### Slice 1: Rescue architecture content and tear down Jekyll

**Acceptance tests** (from structure.md):
- Manual diff: `ARCHITECTURE.md` exists at repo root and matches prior
  `docs/architecture.md` content (no information loss).
- File-presence: `docs/.nojekyll` exists; `docs/_config.yml`,
  `docs/Gemfile`, `docs/Gemfile.lock`, `docs/.ruby-version`,
  `docs/index.md`, `docs/architecture.md` all absent.
- `dev.yml`: `docs` command no longer runs `bundle exec jekyll serve`.

**Steps:**

1. `ARCHITECTURE.md` (repo root, create) [sequential, first] — copy the
   full body of `docs/architecture.md` verbatim. This is the
   rescue-before-delete that the design's "Content loss" risk requires.
   Do not edit the prose; this slice is a move, not a rewrite.

2. `docs/architecture.md` (delete) [parallel with step 3-7 after step 1].

3. `docs/index.md` (delete) [parallel].

4. `docs/_config.yml` (delete) [parallel].

5. `docs/Gemfile` (delete) [parallel].

6. `docs/Gemfile.lock` (delete) [parallel].

7. `docs/.ruby-version` (delete) [parallel].

8. `docs/.nojekyll` (create, empty file) [parallel] — marker that tells
   GitHub Pages to skip Jekyll processing.

9. `dev.yml` (edit) [sequential, last] — replace the `docs:` command
   block (currently `cd docs && bundle config set --local path
   'vendor/bundle' && bundle install && bundle exec jekyll serve
   --livereload`) with a placeholder pointing at the future
   `cd docs && npm start` path (slice 8 finalizes). Keep the `open.docs`
   entry but update it to `http://localhost:8080` to match the future
   live-server port. Leaving the command broken is acceptable here
   because slice 8 finalizes; do not delete the key.

**Files NOT touched in this slice** (called out because of cross-slice
overlap): `docs/CNAME` (kept verbatim), `docs/screenshots/` (kept),
`docs/plans/` (kept), root `package.json` (untouched), `docs/package.json`
(does not yet exist — slice 8 owns it).

**Verification:** `ls docs/.nojekyll docs/CNAME` succeed; `ls
docs/_config.yml docs/Gemfile docs/index.md docs/architecture.md` all
fail with "No such file"; `head -1 ARCHITECTURE.md` shows the
architecture doc's first line; `grep -q 'bundle exec jekyll' dev.yml`
returns non-zero.

**Commit:** `chore(docs): rescue architecture content and remove Jekyll site`

### Slice 2: Static page shell with Phaser CDN bootstrap

**Acceptance tests** (from structure.md):
- File-presence: `docs/index.html` and `docs/src/main.js` exist;
  `index.html` references `phaser@3.80.1` with `integrity=` attribute
  and `crossorigin="anonymous"`.
- Manual browser open: 640x480 colored canvas visible (320x240 zoom 2);
  console clean.
- Edge case: blocking jsdelivr in devtools triggers visible fallback
  `<div>` within ~3s.

**Steps:**

1. `docs/index.html` (create) — minimal HTML5 doc:
   - `<title>Team — Plugin Office Demo</title>`
   - `<script src="https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js"
     integrity="sha384-..." crossorigin="anonymous"></script>` —
     compute the SRI hash for phaser@3.80.1/dist/phaser.min.js
     (e.g. `curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A`)
     and embed it verbatim. The hash is load-bearing per design §Risks
     "CDN supply chain".
   - `<script type="module" src="src/main.js"></script>` after the
     Phaser tag.
   - `<div id="game"></div>` host element.
   - `<div id="cdn-fallback" hidden>Phaser failed to load. Check your
     network or run <code>cd docs &amp;&amp; npm start</code> locally.</div>`
   - Inline `<script>` that, after `DOMContentLoaded` + 3000ms, checks
     `if (!window.Phaser) document.getElementById('cdn-fallback').hidden = false;`
   - Minimal CSS to center the canvas and style the fallback div.

2. `docs/src/main.js` (create) — ESM browser module (no `node:` imports;
   this is browser code per design §Patterns "Explicit non-application"):
   - Phaser config: `width: 320, height: 240, pixelArt: true,
     parent: 'game', physics: { default: 'arcade' }, backgroundColor: '#3a5'`
     (placeholder bg color so the slice's "non-empty colored canvas"
     test passes even with no assets).
   - Scene with empty `preload()`, `create()` that calls
     `this.cameras.main.setZoom(2)`, empty `update()`.
   - `new Phaser.Game(config)` at module top level.

**Verification:** Open `docs/index.html` in a browser; observe a
640x480 green canvas (320 * 2 = 640, 240 * 2 = 480). Devtools network
tab shows phaser.min.js loaded with no integrity-mismatch errors.
Block `cdn.jsdelivr.net` via devtools "Block request domain" and
reload; fallback `<div>` appears within 3 seconds.

**Commit:** `feat(docs): add Phaser canvas bootstrap with CDN loader`

### Slice 3: Asset generator and committed PNGs

**Acceptance tests** (from structure.md):
- File-presence + size: `agent.png` exactly 64x16; `office.png` exactly
  320x240; both decode as valid PNGs.
- Idempotency: re-running generator produces byte-identical PNGs.
- Visual review at PR time.

**Steps:**

1. `docs/scripts/generate-assets.mjs` (create) — ESM Node script
   mirroring `hooks/pre-compact-anchor.mjs` style (design §Patterns
   "ESM + kebab-case", "Single-file `main()` invoked at end of file"):
   - `import { writeFile, mkdir } from "node:fs/promises";`
   - `import { join, dirname } from "node:path";`
   - `import { fileURLToPath } from "node:url";`
   - `import { PNG } from "pngjs";` (declared in `docs/package.json`
     devDeps in step 3 below).
   - `async function main()` at end of file; wrap body in try/catch and
     `process.exit(1)` only on genuine I/O failure, per design §Patterns
     "Fail-open / fail-soft on the generator script".
   - Generates `docs/assets/sprites/agent.png` (64x16, 4 frames * 16x16):
     a simple pixel-art figure (head, torso, arms, legs) per frame, with
     two walk frames and idle frame; deterministic palette.
   - Generates `docs/assets/backgrounds/office.png` (320x240): floor
     color, simple desk rectangles at the desk positions slice 5 will
     reuse, plant/monitor accents. Deterministic — no `Math.random()`;
     any randomness must come from a seeded source so re-runs match.
   - Resolves output paths relative to the script via
     `fileURLToPath(import.meta.url)` so it works from any cwd.

2. Run `node docs/scripts/generate-assets.mjs` and commit the two
   produced PNGs:
   - `docs/assets/sprites/agent.png` (committed binary)
   - `docs/assets/backgrounds/office.png` (committed binary)

3. `docs/package.json` (create — stub form; slice 8 expands) — minimal
   `{"name": "team-docs", "private": true, "type": "module",
   "devDependencies": {"pngjs": "^7.0.0"}}`. This is the only field
   slice 3 owns; slice 8 adds the `scripts` block and `live-server`.
   Cross-slice note: do NOT add `live-server` here; slice 8 owns it.

**Verification:**
- `node docs/scripts/generate-assets.mjs` exits 0.
- `file docs/assets/sprites/agent.png` reports `PNG image data, 64 x 16`.
- `file docs/assets/backgrounds/office.png` reports `PNG image data,
  320 x 240`.
- Re-run the generator: `git status` shows no changes to the PNGs.

**Commit:** `feat(docs): add asset generator and generated office/agent PNGs`

### Slice 4: Player-controlled agent with movement and animation

**Acceptance tests** (from structure.md):
- Manual: arrow keys and WASD both move; release returns to idle;
  left motion flips sprite.
- Edge case: walking into each canvas edge stops cleanly.
- Edge case: deleting `agent.png` then reloading shows visible "asset
  load failed" overlay.

**Steps:**

1. `docs/src/main.js` (edit) — extend the slice 2 skeleton:
   - In `preload()`:
     - `this.load.image('office', 'assets/backgrounds/office.png');`
     - `this.load.spritesheet('agent', 'assets/sprites/agent.png',
       { frameWidth: 16, frameHeight: 16 });`
     - Wire `this.load.on('loaderror', (file) => {...})` to set a
       flag, log `console.error('asset load failed:', file.key)`, and
       in `create()` render a `Phaser.GameObjects.Text` overlay reading
       "asset load failed" centered on the canvas. This is the design
       §Edge cases "Invalid inputs" overlay and is reused unchanged in
       all later slices.
   - In `create()`:
     - `this.add.image(160, 120, 'office');` (background centered;
       320x240 canvas).
     - `this.player = this.physics.add.sprite(160, 120, 'agent', 0);`
     - `this.player.body.setSize(12, 14).setOffset(2, 1);` — verbatim
       per design §Decisions made #5.
     - `this.player.setCollideWorldBounds(true);`
     - Define animations:
       - `this.anims.create({ key: 'walk', frames: this.anims.generateFrameNumbers('agent', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });`
       - `this.anims.create({ key: 'idle', frames: [{ key: 'agent', frame: 0 }], frameRate: 1 });`
     - Capture cursors + WASD:
       - `this.cursors = this.input.keyboard.createCursorKeys();`
       - `this.wasd = this.input.keyboard.addKeys('W,A,S,D');`
   - In `update()`:
     - Read `cursors` and `wasd`; combine left/right/up/down using OR.
     - Set `this.player.setVelocity(...)` at 60 px/s (tunable constant
       at top of file).
     - If moving, play `'walk'`; if idle, play `'idle'`.
     - `this.player.setFlipX(true)` when moving left;
       `setFlipX(false)` when moving right; preserve last-facing on
       idle (do not flip back).

**Verification:** Open `docs/index.html` in a browser; arrow keys and
WASD both move the player; sprite cycles through 4-frame walk; releasing
returns to frame 0; left motion flips horizontally; player stops at
each of the four world edges. Rename `docs/assets/sprites/agent.png`
out of the way and reload — overlay "asset load failed" appears. Restore
the file before committing.

**Commit:** `feat(docs): add player-controlled agent with movement and animation`

### Slice 5: Office desks, occupation model, NPC spawn positions

**Acceptance tests** (from structure.md):
- Manual: 13 sprites visible (1 player + 12 NPCs); none overlap each
  other or a desk; none off-canvas.
- Edge case: empty desk set causes fail-fast in `create()`.
- File inspection: desks config has at least as many desks as NPCs that
  ever sit.

**Steps:**

1. `docs/src/main.js` (edit) — add desk/NPC scaffolding:
   - Module-level constant `DESKS`: array of at least 12 objects
     `{ id: string, x: number, y: number, w: number, h: number }`
     covering the desk rectangles the office background depicts. Use
     stable string ids like `'desk-0'..'desk-11'` (the `Set<string>`
     occupation model in design §Decisions made #5 keys on these).
   - In `create()`, after the background but before sprite creation:
     `if (DESKS.length === 0) throw new Error('DESKS config must contain at least one desk');`
     This is the design §Edge cases "Empty desk set" fail-fast.
   - Module-level constant `OCCUPIED`: `const OCCUPIED = new Set();`
     (still empty in this slice; slice 6 mutates it).
   - Create 12 NPC sprites in a loop, deterministic spawn positions
     (e.g. spread across canvas so none overlap the player at (160,120)
     and none overlap a desk's hitbox). Use the same `'agent'`
     spritesheet and frame 0; do not give NPCs cursor/WASD input.
   - Store NPCs in `this.npcs = []` for slice 6 to consume.
   - Add a debug flag `const DEBUG_DESKS = false;` at module top; when
     true, `create()` draws `this.add.rectangle(x, y, w, h, 0xff0000, 0.3)`
     for each desk so the verification step can confirm geometry.

**Verification:** Open the page; count 13 sprites on screen; toggle
`DEBUG_DESKS = true` locally and confirm desk rectangles match the
background art; revert the flag before committing. Confirm no console
errors.

**Commit:** `feat(docs): add office desks and NPC roster`

### Slice 6: NPC patrol behavior with desk occupation and working indicator

**Acceptance tests** (from structure.md):
- Manual (60s observation): every NPC reaches a desk; "working"
  indicator visible ~4-6s; no two NPCs share a desk.
- Edge case: forced contention — two NPCs targeting the same desk
  resolve by the second picking a new target.
- Edge case: backgrounded tab pauses/resumes cleanly with no timer leak.

**Steps:**

1. `docs/src/main.js` (edit) — add per-NPC state machine:
   - Per NPC, store state `{ mode: 'idle' | 'walking' | 'working',
     targetDeskId: string | null, indicator: Phaser.GameObjects.Text }`.
   - `pickNextDestination(npc)`: filter `DESKS` by
     `!OCCUPIED.has(desk.id)`; if empty, stay idle until a future tick;
     else pick one at random, set `npc.targetDeskId = desk.id`,
     `npc.mode = 'walking'`, and set velocity toward `(desk.x, desk.y)`.
   - In `update()`, for each NPC:
     - If `mode === 'walking'` and the NPC has arrived (distance to
       target < small threshold), atomically check
       `OCCUPIED.has(targetDeskId)`: if true (race — design §Edge cases
       "Concurrency"), call `pickNextDestination(npc)` again; else
       `OCCUPIED.add(targetDeskId)`, set `mode = 'working'`,
       `setVelocity(0,0)`, set indicator text to `'working'`, and
       schedule a release via `this.time.addEvent({ delay:
       Phaser.Math.Between(4000, 6000), callback: () => {
       OCCUPIED.delete(targetDeskId); npc.targetDeskId = null;
       pickNextDestination(npc); } })`. Using `time.addEvent` (not
       `setInterval`) per design §Edge cases "Resource limits".
     - If `mode === 'walking'`, indicator text = `'walking'`.
   - Initialize each NPC's indicator in `create()`:
     `npc.indicator = this.add.text(npc.x, npc.y - 12, 'idle', { fontSize: '8px', color: '#fff' }).setOrigin(0.5, 1);`
     Update its position to follow the NPC in `update()`.
   - At end of `create()`, call `pickNextDestination(npc)` for each NPC
     so they all start walking.
   - NPCs do not collide with the player or each other (design notes
     player passes through occupied desks); only desk occupation is
     tracked.

**Verification:** Watch the page for 60 seconds; every NPC walks,
sits, displays "working", releases, and re-targets. Temporarily reduce
`DESKS` to length 1 to force contention; confirm no two NPCs occupy
the same desk; restore `DESKS` before committing. Switch tabs for 30s,
return — simulation continues cleanly with no console errors.

**Commit:** `feat(docs): add NPC patrol, desk occupation, and working indicator`

### Slice 7: Name labels mapping characters to the 13 plugin agents

**Acceptance tests** (from structure.md):
- Manual: 13 distinct readable name labels above sprites; labels track
  sprites; sprite flip does not flip label text.
- File inspection: the 13-name array in `main.js` matches
  `skills/team/registry.json` agents verbatim.
- Edge case: labels at the top canvas edge clamped to stay readable.

**Steps:**

1. `docs/src/main.js` (edit) — add name labels:
   - Module-level constant `AGENT_NAMES` (verbatim, in this order, from
     `skills/team/registry.json` `agents[].name`):
     ```
     ['questioner', 'file-finder', 'researcher', 'design-author',
      'structure-planner', 'planner', 'test-architect', 'implementer',
      'code-reviewer', 'security-reviewer', 'technical-writer',
      'ux-reviewer', 'verifier']
     ```
     Total 13 — assigned 1:1 to player + 12 NPCs. Pick a deterministic
     assignment (e.g. player = `AGENT_NAMES[0]` = `'questioner'`, NPCs
     take indices 1..12 in their creation order).
   - In `create()`, per sprite (player and NPCs), add a separate
     `Phaser.GameObjects.Text` for the name:
     `sprite.nameLabel = this.add.text(sprite.x, sprite.y - 20,
     AGENT_NAMES[i], { fontSize: '8px', color: '#fff', stroke: '#000',
     strokeThickness: 2 }).setOrigin(0.5, 1);`
     The stroke ensures readability against the office background.
     Note: this is a separate Text object from the slice 6 `indicator`
     and lives above it. The label is NOT a child of the sprite — that
     guarantees sprite `setFlipX(true)` does not mirror the text.
   - In `update()`, after sprite positions are settled, sync each
     label's position: `sprite.nameLabel.x = sprite.x;
     sprite.nameLabel.y = Math.max(8, sprite.y - 20);` — the `Math.max`
     clamps so a label never renders above y=0 (design §Edge cases for
     this slice).
   - Sync the slice 6 indicator similarly but offset further so the two
     do not collide: `npc.indicator.y = Math.max(16, npc.y - 12);`

**Verification:** Open the page; read 13 distinct labels; pick any
agent name (e.g. `researcher`) within 5 seconds and identify the
sprite. Verify the `AGENT_NAMES` literal in `docs/src/main.js` matches
`skills/team/registry.json` with:
`grep -oE '"name": "[a-z-]+"' skills/team/registry.json | sort` against
the same names extracted from `main.js`. Move a sprite to the top edge
(or temporarily spawn one at y=0) and confirm the label stays inside
the canvas; revert any temporary changes before committing.

**Commit:** `feat(docs): add name labels mapping characters to plugin agents`

### Slice 8: `docs/package.json`, README, and local-dev wiring

**Acceptance tests** (from structure.md):
- File-presence: `docs/package.json` exists; `"start"` script matches
  `live-server --port=8080 --open=./index.html` verbatim; no `phaser`
  dependency listed.
- Manual: `cd docs && npm install && npm start` opens browser at
  `http://localhost:8080` with the demo running and live-reload active.
- README inspection: agent-to-plugin paragraph names all 13 agents and
  links to QRSPI phases.
- Edge case: README does not promise audio, click-to-send, or mobile.

**Steps:**

1. `docs/package.json` (edit — expand the slice 3 stub):
   - Keep `"name": "team-docs"`, `"private": true`, `"type": "module"`.
   - Keep `"pngjs"` in `devDependencies` (slice 3 added it).
   - Add `"live-server"` to `devDependencies` (e.g. `"^1.2.2"`).
   - Add `"scripts": { "start": "live-server --port=8080
     --open=./index.html", "generate-assets": "node
     scripts/generate-assets.mjs" }`. The `start` script must match
     verbatim per the structure's spec.
   - Do NOT add a `phaser` dependency (Phaser is CDN per design
     §Decisions made #2).

2. `docs/README.md` (create) — sections:
   - **Run locally:** `cd docs && npm install && npm start`. Mentions
     port 8080 and live-reload.
   - **Run without install:** open `docs/index.html` directly in any
     browser; Phaser loads from CDN.
   - **Regenerate assets:** `npm run generate-assets` (idempotent).
   - **Agents in the scene** paragraph: lists all 13 names from
     `AGENT_NAMES` (player + 12 NPCs) and maps them to the QRSPI phases
     they serve (QUESTION/RESEARCH/DESIGN/STRUCTURE/PLAN/IMPLEMENT).
     Reference `skills/team/registry.json` as the source of truth and
     point at the repo-root `ARCHITECTURE.md` for context. Do NOT
     mention audio, click-to-send, or mobile (design §Out of scope).

3. `dev.yml` (edit — finalize the slice 1 placeholder):
   - Replace the `docs:` command body with
     `cd docs && npm install && npm start`.
   - Update `desc:` to `"Serve the Phaser office demo locally at
     http://localhost:8080"`.
   - Keep `open.docs: "http://localhost:8080"` (slice 1 already updated
     it; confirm).

**Verification:**
- `grep -q '"start": "live-server --port=8080 --open=./index.html"'
  docs/package.json` succeeds.
- `grep -v '"phaser"' docs/package.json` confirms no phaser dep.
- For each name in `AGENT_NAMES`: `grep -q "<name>" docs/README.md`
  succeeds.
- Fresh-clone simulation: `\rm -rf docs/node_modules` then `cd docs &&
  npm install && npm start` opens browser at `http://localhost:8080`
  with the demo running.
- Re-run prior slices' manual checks (player moves, NPCs patrol, labels
  visible) — no regressions.

**Commit:** `feat(docs): add package.json, README, and dev.yml integration`

## Cross-slice file-conflict callouts

These are the only files touched by more than one slice. The
implementer must respect ownership boundaries:

- **`dev.yml`** — slice 1 puts the `docs:` command in a clean
  intermediate state (placeholder pointing at the future `npm start`,
  with `open.docs` updated to port 8080). Slice 8 replaces the
  placeholder with the final `cd docs && npm install && npm start`.
  Codebase is never broken at a slice boundary.
- **`docs/package.json`** — slice 3 creates the stub with `pngjs` in
  devDeps (needed for the generator). Slice 8 adds `live-server` and
  the `scripts` block. Do NOT add `live-server` in slice 3 or
  re-create the file in slice 8; expand the existing stub.
- **`docs/src/main.js`** — slices 2, 4, 5, 6, 7 all extend it. Each
  slice adds the minimum surface area its acceptance tests require;
  do not pre-stage hooks for later slices.

## Done Criteria

- All 8 slices' acceptance tests pass (per-slice verification steps).
- `docs/index.html` opens in any browser with zero setup and shows
  the full demo (player + 12 NPCs + labels + patrol).
- `cd docs && npm install && npm start` runs live-server on port 8080
  with auto-reload.
- `docs/.nojekyll` present; no Jekyll source files remain under
  `docs/`; `ARCHITECTURE.md` at repo root preserves the architecture
  prose.
- The 13 names in `docs/src/main.js` `AGENT_NAMES` and in
  `docs/README.md` match `skills/team/registry.json` `agents[].name`
  in order.
- Re-running `node docs/scripts/generate-assets.mjs` produces
  byte-identical PNGs (idempotent generator).
- No regressions in `tests/*.sh` bash suite.
