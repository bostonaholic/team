---
topic: phaser-office-demo
date: 2026-05-28
phase: structure
approved: true
approved_at: 2026-05-28T21:50:53Z
revision: 1
---

# Structure: phaser-office-demo

The demo replaces a live Jekyll site, so slice 1 deliberately rescues the
only piece of irreplaceable content (architecture prose) before any
deletion. Slice 2 then ships a viewer-visible static page on a clean
foundation — even with a placeholder canvas, that is the "smallest thing
a real visitor sees" and is the product hook the design promises. Each
subsequent slice adds one layer of interactivity that a visitor can
notice in the browser.

## Slices

### Slice 1: Rescue architecture content and tear down Jekyll
**Goal:** Repo no longer ships a Jekyll site; the substantive architecture content survives at the repo root, and GitHub Pages is set up to serve `docs/` verbatim.
**Layers touched:** repo-root docs (`ARCHITECTURE.md`), `docs/` file removals, `docs/.nojekyll` marker, `dev.yml` command list.
**Tests:**
- Manual diff inspection: `ARCHITECTURE.md` exists at repo root and its body matches the prior `docs/architecture.md` content (no information loss).
- File-presence check: `docs/.nojekyll` exists; `docs/_config.yml`, `docs/Gemfile`, `docs/Gemfile.lock`, `docs/.ruby-version`, `docs/index.md`, `docs/architecture.md` all absent.
- `dev.yml`: the `docs` command no longer runs `bundle exec jekyll serve`; either removed or replaced with a placeholder pointing at the new `npm start` path (slice 8 finalizes the replacement).
**Verification checkpoint:** `git status` and `git diff` show the rescue-then-delete sequence; the Jekyll teardown is a single atomic commit. Visiting `team.bostonaholic.dev` would 404 (expected — no `index.html` yet), but the repo is now a valid `.nojekyll` static-site source. Edge case from design's "Content loss" risk is satisfied because the move precedes the delete in the same commit.
**Atomic commit message:** `chore(docs): rescue architecture content and remove Jekyll site`

### Slice 2: Static page shell with Phaser CDN bootstrap
**Goal:** A visitor opening `docs/index.html` in any browser (file:// or served) sees a Phaser canvas come alive — a 320x240 scene scaled 2x, solid background color, no assets yet. The smallest thing a real person can see and that proves the loader, the CDN, and the SRI hash work.
**Layers touched:** `docs/index.html`, `docs/src/main.js` (preload/create/update skeleton), CDN `<script>` with `phaser@3.80.1` SRI hash, CDN-unreachable fallback `<div>`.
**Tests:**
- File-presence check: `docs/index.html` and `docs/src/main.js` exist; `index.html` references `phaser@3.80.1` with an `integrity=` attribute and `crossorigin="anonymous"`.
- Manual browser open: visiting the file shows a non-empty colored canvas at 640x480 (320x240 zoom 2) with no console errors and no 404s.
- Edge case (CDN unreachable, design §Edge cases "Failure paths"): with devtools blocking jsdelivr, the visible fallback `<div>` appears within ~3s instructing the visitor to retry or run locally.
**Verification checkpoint:** Open `docs/index.html` directly in a browser — canvas renders, devtools console is clean. Block the CDN, reload — fallback message visible.
**Atomic commit message:** `feat(docs): add Phaser canvas bootstrap with CDN loader`

### Slice 3: Asset generator and committed PNGs
**Goal:** Running the generator produces both required PNGs; the generated PNGs are then committed so the runtime works on a fresh clone with zero install.
**Layers touched:** `docs/scripts/generate-assets.mjs` (ESM, `node:fs/promises`, fail-soft `main()` matching `hooks/*.mjs` style — design §Patterns to follow), `docs/assets/sprites/agent.png` (64x16), `docs/assets/backgrounds/office.png` (320x240). If the generator uses `pngjs`, add it to `docs/package.json` devDeps now (slice 8 finalizes the `package.json` story).
**Tests:**
- File-presence + size sanity: `agent.png` is exactly 64x16; `office.png` is exactly 320x240. Both files non-empty and decode as valid PNGs (`file docs/assets/...` or `pngjs` round-trip).
- Re-running the generator is idempotent: PNGs unchanged byte-for-byte on a second run (deterministic output).
- Edge case (design §Risks "Visual quality"): PR-time visual review of the two PNGs; if either looks wrong, the script is the only file to re-edit.
**Verification checkpoint:** `node docs/scripts/generate-assets.mjs` exits 0 and writes both PNGs; `git diff --stat` after a re-run shows zero changed bytes.
**Atomic commit message:** `feat(docs): add asset generator and generated office/agent PNGs`

### Slice 4: Player-controlled agent with movement and animation
**Goal:** A visitor opening the page sees one pixel-art agent on the office background, controllable with arrow keys and WASD, walking with a 4-frame animation and flipping horizontally when moving left, clamped to the canvas bounds.
**Layers touched:** `docs/src/main.js` — `preload()` loads `agent.png` (spritesheet 16x16) and `office.png`; `create()` adds background + player sprite + cursor and WASD keys; `update()` reads input and sets velocity; animation config `idle` (frame 0) and `walk` (frames 0-3 @ 8fps); body `setSize(12,14).setOffset(2,1)`; `collideWorldBounds(true)`. Design §Decisions made #5.
**Tests:**
- Manual browser check: pressing arrow keys moves the player; pressing WASD also moves the player; releasing returns to idle frame; left motion flips the sprite.
- Edge case (design §Edge cases "Boundary values"): walking into each of the four canvas edges stops cleanly — sprite never escapes the 320x240 world.
- Edge case (design §Edge cases "Invalid inputs"): deleting `agent.png` then reloading shows the visible "asset load failed" overlay rather than a black canvas.
**Verification checkpoint:** Browser-driven walkthrough — single player visibly walks, idles, flips, and is bounded.
**Atomic commit message:** `feat(docs): add player-controlled agent with movement and animation`

### Slice 5: Office desks, occupation model, NPC spawn positions
**Goal:** The office layout defines a fixed set of desks (hitboxes + ids), an occupation `Set<string>` is initialized, and twelve NPC sprites are spawned at deterministic starting positions. NPCs are placed but not yet moving — the visitor sees the full 13-character cast on screen.
**Layers touched:** `docs/src/main.js` — a `desks` config array (id, x, y, w, h), a `Set` to track occupation, a loop creating 12 NPC sprites alongside the player. No NPC behavior yet.
**Tests:**
- Manual browser check: all 13 sprites (1 player + 12 NPCs) visible, none overlapping each other or a desk, none outside the canvas.
- Edge case (design §Edge cases "Boundary values" — "Empty desk set"): `create()` asserts `desks.length > 0` and throws fast in console if the config is empty (fail-fast per project first principles).
- File inspection: the desks config has at least as many desks as NPCs that ever sit (so the "no NPC starves" property holds for slice 6).
**Verification checkpoint:** Browser shows 13 motionless characters on the office background; toggling a debug flag draws desk hitbox rectangles to confirm geometry.
**Atomic commit message:** `feat(docs): add office desks and NPC roster`

### Slice 6: NPC patrol behavior with desk occupation and working indicator
**Goal:** The twelve NPCs wander, walk to a randomly chosen unoccupied desk, sit for 4-6 seconds showing a "working" text indicator above the head, then release the desk and pick a new target. This is the moment the demo communicates "agents doing distinct work."
**Layers touched:** `docs/src/main.js` — per-NPC state machine (idle → walking → working → idle), `time.addEvent` Phaser-managed timers (design §Edge cases "Resource limits"), desk-occupation checks at "pick next destination" and on arrival, text indicator above sprite that switches between "walking" and "working" per the brief.
**Tests:**
- Manual browser check (60-second observation): every NPC reaches at least one desk; "working" indicator visible for ~4-6 seconds; no two NPCs ever share a desk.
- Edge case (design §Edge cases "Concurrency"): two NPCs targeting the same desk — the second arrival picks a new target instead of overlapping. Force the case by reducing the desk count temporarily during dev and confirm no double-occupation.
- Edge case (design §Edge cases "Resource limits"): backgrounding the tab for 30 seconds and returning shows the simulation paused and resumed cleanly with no timer leak.
**Verification checkpoint:** Browser observation matches the design's product goal — a visitor watching for ~10 seconds sees agents wandering, sitting at desks, and switching activities.
**Atomic commit message:** `feat(docs): add NPC patrol, desk occupation, and working indicator`

### Slice 7: Name labels mapping characters to the 13 plugin agents
**Goal:** Each sprite carries a persistent name label above it, naming one of the 13 plugin agents from `skills/team/registry.json`. A visitor immediately reads which character is `researcher`, `design-author`, etc. — the design's "teach the plugin roster at a glance" goal.
**Layers touched:** `docs/src/main.js` — a literal array of the 13 agent names in the exact order from `skills/team/registry.json` (questioner, file-finder, researcher, design-author, structure-planner, planner, test-architect, implementer, code-reviewer, security-reviewer, technical-writer, ux-reviewer, verifier); a label-following `Phaser.GameObjects.Text` per sprite that tracks position each frame.
**Tests:**
- Manual browser check: 13 distinct, readable name labels visible above the sprites; labels track their sprite as it moves; left/right flip of the sprite does not flip the label text.
- File inspection: the 13-name array in `main.js` matches the 13 agent names in `skills/team/registry.json` verbatim (cross-file grep).
- Edge case: labels at canvas edges remain readable (clamp Y so a label never renders above y=0).
**Verification checkpoint:** Browser screenshot shows all 13 named agents; a viewer can name-spot any specific agent (e.g. `researcher`) within 5 seconds.
**Atomic commit message:** `feat(docs): add name labels mapping characters to plugin agents`

### Slice 8: `docs/package.json`, README, and local-dev wiring
**Goal:** A fresh-clone developer can `cd docs && npm install && npm start` and get live-server on port 8080 auto-opening the demo; the README explains both how to run and how the 13 characters map to the plugin pipeline.
**Layers touched:** `docs/package.json` (devDeps: `live-server`, plus `pngjs` only if slice 3's generator used it; `"start": "live-server --port=8080 --open=./index.html"`); `docs/README.md` (run instructions + agent-to-plugin paragraph the design promises); `dev.yml` `docs` command updated to point at `cd docs && npm start` (replacing the slice-1 placeholder).
**Tests:**
- File-presence check: `docs/package.json` exists; `"start"` script matches the spec verbatim; no `phaser` dependency listed (CDN, per design §Decisions made #2).
- Manual run: `cd docs && npm install && npm start` opens a browser at `http://localhost:8080` with the demo running and live-reload active.
- README inspection: the agent-to-plugin paragraph names all 13 agents and links to the source pipeline phases (QRSPI).
- Edge case (design §Out of scope check): README explicitly does not promise audio, click-to-send, or mobile support, matching the design's deferred scope.
**Verification checkpoint:** Fresh clone walkthrough: clone → `cd docs && npm install && npm start` → demo loads, all prior-slice behaviors still pass.
**Atomic commit message:** `feat(docs): add package.json, README, and dev.yml integration`

## Cross-slice concerns

- **The 13-agent name list** appears in slice 7 (labels) and slice 8 (README paragraph). Both must reference `skills/team/registry.json` as the source of truth; if the registry adds or renames an agent, both labels and README update together. The design treats this list as load-bearing (decision #4).
- **`docs/package.json` devDeps** are introduced lazily: slice 3 may add `pngjs` (if the generator needs it); slice 8 adds `live-server` and finalizes the file. Either both land in slice 8, or slice 3 ships a stub `package.json` that slice 8 expands — implementer's call, but the file's final shape is owned by slice 8.
- **`dev.yml docs` command** is touched in slice 1 (Jekyll removal) and slice 8 (npm start replacement). Slice 1 should leave it in a clean intermediate state (removed or placeholder), and slice 8 finishes the migration so the codebase is never broken at a slice boundary.
- **Asset-load failure overlay** (design §Edge cases "Invalid inputs") is wired in slice 4 when assets are first loaded; reused unchanged thereafter.
- **CDN fallback `<div>`** is wired in slice 2; reused unchanged thereafter.

## Out of structure

Restated from design §Out of scope so the planner does not pull them in:

- Audio (footsteps, chimes, music).
- Click-to-send-agent-to-desk interaction.
- Mobile / touch controls.
- Accessibility audit; no screen-reader story.
- Internationalization.
- Automated visual-regression or browser tests (the repo has no JS test runner; verification is file-presence + manual browser inspection per the orchestrator's brief).
- Preserving Jekyll URLs / `/architecture` redirects.
- Backend, analytics, telemetry, rate limiting.
- A "now showing: <agent> is doing <phase>" caption (design §Open questions — deferred).
