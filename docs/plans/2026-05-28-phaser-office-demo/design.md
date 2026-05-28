---
topic: phaser-office-demo
date: 2026-05-28
phase: design
approved: true
approved_at: 2026-05-28T21:36:53Z
revision: 1
---

# Design: phaser-office-demo

> Note on interactive ask: this sub-agent's runtime does not expose
> `AskUserQuestion`. The four open questions the research surfaced are
> recorded below in `## Decisions made` with the recommended option taken
> as the working assumption and the alternatives written out. The human
> design-approval gate is the redirect point — if any decision is wrong,
> reject and the orchestrator will dispatch a revision.

## Current state

`docs/` is a live Jekyll 3.10.0 site (via `github-pages` gem 232, minima
theme 2.5.1, Ruby 3.3.6) deployed to `team.bostonaholic.dev` by GitHub
Pages using `docs/` as the publishing source. Two content pages exist:
`docs/index.md` (frontmatter `title: Overview`, `permalink: /` — the
landing page) and `docs/architecture.md` (the plugin architecture
reference). Supporting files: `docs/_config.yml`, `docs/Gemfile`,
`docs/Gemfile.lock`, `docs/.ruby-version`, `docs/CNAME` (single line
`team.bostonaholic.dev`), and three tracked PNG screenshots under
`docs/screenshots/`.

The pipeline-state directory `docs/plans/` sits beside the Jekyll source
but is excluded from publication via `_config.yml`'s `exclude:` list.
`.gitignore` covers `docs/_site/`, `docs/.jekyll-cache/`,
`docs/.sass-cache/`, `docs/.jekyll-metadata`, `docs/.bundle/`, and
`docs/vendor/`. `docs/assets/`, `docs/src/`, `docs/node_modules/` are
**not** ignored — so anything new added under those paths will be
tracked unless we exclude it.

No browser-runnable source files exist outside `vendor/` (gemmed) and
`_site/` (built output). No custom pixel art, brand colors, or design
tokens are committed anywhere. No CI workflows. The root `package.json`
is ESM/bun-flavoured with no scripts, deps, or lockfile — unrelated to
the demo.

## Desired end state

`docs/` becomes a no-build static site that serves the Phaser 3 demo at
`https://team.bostonaholic.dev/`. Jekyll is removed. GitHub Pages
continues to publish from `docs/`, but a `docs/.nojekyll` marker tells
Pages to bypass Jekyll processing and serve files verbatim.

New tree under `docs/`:

```
docs/
  .nojekyll                    # disables GitHub Pages' Jekyll step
  index.html                   # loads Phaser (CDN) + src/main.js
  package.json                 # devDependency: live-server; "start" script
  README.md                    # how to run + agent-to-character mapping
  src/
    main.js                    # Phaser preload/create/update, agents
  assets/
    sprites/agent.png          # 64x16 sprite sheet (4 frames * 16x16)
    backgrounds/office.png     # 320x240 office background
  scripts/
    generate-assets.mjs        # one-shot generator for the two PNGs above
  CNAME                        # kept verbatim
  screenshots/                 # kept (referenced from repo README)
  plans/                       # kept (pipeline state, unrelated)
```

Removed: `docs/index.md`, `docs/architecture.md`, `docs/_config.yml`,
`docs/Gemfile`, `docs/Gemfile.lock`, `docs/.ruby-version`. The
architecture content already lives in `docs/architecture.md` in the
git history and in repo-root references (`CLAUDE.md`,
`docs/architecture.md` link from project docs); we will move the
substantive content of `docs/architecture.md` into the repo root as
`ARCHITECTURE.md` so no information is lost. `dev.yml`'s `docs` command
(`bundle exec jekyll serve --livereload`) will be removed; local preview
becomes `cd docs && npm start`.

A developer landing on `team.bostonaholic.dev` cold sees: a
320x240-scaled-2x pixel-art office with desks, plants, monitors; one
player-controlled agent (arrow keys / WASD); twelve NPC agents wandering,
walking to desks, and showing a "working" indicator while seated. Name
labels above each sprite map each character to a real plugin agent
(researcher, design-author, etc.). The README paragraph closes the loop
in prose.

## Patterns to follow

- **ESM + kebab-case file names** mirroring `hooks/*.mjs` and
  `skills/*/SKILL.md`. The asset generator (`scripts/generate-assets.mjs`)
  uses `import` syntax and `node:` built-ins (`node:fs/promises`,
  `node:path`), matching `hooks/pre-compact-anchor.mjs` style.
- **Fail-open / fail-soft on the generator script** — match the hook
  convention (`hooks/post-write-validate.mjs:catch`): never throw past
  `main()`; print a diagnostic and exit non-zero only on a genuine I/O
  failure.
- **Single-file `main()` invoked at end of file** for the generator,
  matching all four `hooks/*.mjs`.
- **YAML frontmatter and topic conventions** apply only to pipeline
  artifacts under `docs/plans/`; the demo's `index.html` / `main.js` /
  `README.md` are end-user web content and follow web conventions, not
  plugin-runtime conventions.
- **Explicit non-application:** the demo runs in a browser. None of the
  plugin's runtime patterns (stdin-JSON I/O, `process.stdout.write`,
  `${CLAUDE_PLUGIN_ROOT}`, the `post-write-validate.mjs` validator)
  apply to anything under `docs/src/` or `docs/index.html`. The
  `post-write-validate` hook validates plugin files only — the demo is
  outside its scope.

## Decisions made

1. **Jekyll fate: full replacement.** Drop `_config.yml`, `Gemfile`,
   `Gemfile.lock`, `.ruby-version`, `index.md`, `architecture.md`; add
   `docs/.nojekyll`. Move the substantive content of `architecture.md`
   to `ARCHITECTURE.md` at the repo root before deletion so the
   reference content is preserved.
   *Alternatives:* (a) Keep Jekyll for `/architecture` and serve the
   demo at `/` — rejected: dual toolchain, collision risk between
   `index.html` and Jekyll's `index.md`->`index.html` output. (b) Demo
   at `/demo/` subpath — rejected: conflicts with the brief's stated
   goal of making the demo the primary landing experience.
   *Product lens:* a developer landing cold benefits more from a single,
   immediate visual hook than from a prose architecture page; the
   architecture page's audience (already-interested contributors) is
   well served by an `ARCHITECTURE.md` link in the repo root README.

2. **Phaser delivery: CDN script tag.** `index.html` loads Phaser from
   `https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js`
   (subresource integrity hash included). `phaser` is **not** an
   npm dependency.
   *Alternative:* `npm install phaser` and import from `node_modules` —
   rejected: forces `npm install` before `open docs/index.html` works in
   any browser. The CDN path makes the demo work on a fresh clone with
   zero setup; `npm start` (live-server) remains optional and only
   exists for auto-reload while iterating.

3. **Asset generation: generator script + committed PNGs.** A Node
   script `docs/scripts/generate-assets.mjs` produces both
   `assets/sprites/agent.png` (64x16, 4 frames) and
   `assets/backgrounds/office.png` (320x240). Generated PNGs are
   committed; the script is committed alongside. The script uses a
   minimal dependency (`pngjs` via `npm` devDependency) or hand-rolled
   PNG encoding — implementation chooses, but the dependency stays in
   `docs/package.json` `devDependencies` so a viewer never installs it.
   *Alternative:* hand-crafted PNGs committed directly — rejected:
   not reproducible, harder to iterate on the office layout or the
   sprite palette, doesn't match the repo's "everything is code" feel.

4. **Agent-to-character mapping: 1 player + 12 NPCs = 13 plugin
   agents, with name labels.** Each sprite carries a name label
   matching the 13 entries in `skills/team/registry.json`:
   `questioner`, `file-finder`, `researcher`, `design-author`,
   `structure-planner`, `planner`, `test-architect`, `implementer`,
   `code-reviewer`, `security-reviewer`, `technical-writer`,
   `ux-reviewer`, `verifier`.
   *Alternative:* 6-8 generic NPCs — rejected: loses the 1:1 mapping the
   README paragraph promises and the product goal of teaching the
   plugin's roster at a glance.
   *Product lens:* the demo's job is to make "13 specialized agents
   working in concert" legible without prose. Anonymous NPCs would
   undermine that.

5. **Canvas / animation defaults.** 320x240 at `pixelArt: true` and
   `cameras.main.setZoom(2)` per the brief. Walk animation 8 fps,
   frames 0-3; idle = frame 0; horizontal flip for left-facing.
   Body collider `setSize(12, 14).setOffset(2, 1)`. NPC patrol picks a
   random unoccupied desk every 6-10 seconds; "working" indicator
   shows for 4-6 seconds at the desk; desk occupation tracked as a
   simple `Set<string>` keyed by desk id (fail-fast if two NPCs try
   to claim the same desk).

6. **`docs/package.json` placement.** Lives at `docs/package.json`
   beside the demo. devDependencies: `live-server` only (Phaser is CDN;
   `pngjs` is only needed if the generator uses it — if so, also
   devDep). The root `package.json` is untouched.

7. **Optional extras (from the brief) — defer.** Name labels are kept
   (they serve the product goal). Click-to-send-agent-to-desk and
   audio (footsteps/chime) are **out of scope** for revision 1: they
   add interaction complexity without serving the "understand the
   plugin in 5 seconds" goal. Reconsider after real user reaction.

## Out of scope

- Audio (footsteps, chimes, music).
- Click-to-send-agent-to-desk interaction.
- Mobile / touch controls.
- Accessibility audit of the canvas (no keyboard navigation beyond
  arrows/WASD; no screen-reader story).
- Internationalization of name labels or README copy.
- Automated visual regression or browser tests (the repo has no CI
  and `tests/*.sh` only covers plugin file structure).
- Preserving the Jekyll site's exact URLs or redirects from
  `/architecture` — link from the repo root README to
  `ARCHITECTURE.md` instead.
- Rate limiting, analytics, telemetry, or any backend.

## Edge cases

- **Boundary values:** player at canvas edge — Arcade physics
  `collideWorldBounds(true)` clamps; no off-by-one against the 320x240
  bounds. Empty desk set — `create()` asserts at least one desk in the
  layout config; fail-fast if zero.
- **Invalid inputs:** missing `assets/sprites/agent.png` or
  `assets/backgrounds/office.png` — Phaser's loader emits a
  `loaderror` event; the demo logs to `console.error` and renders a
  visible "asset load failed" text overlay rather than a black canvas.
- **Failure paths:** CDN unreachable (offline or blocked) — `index.html`
  includes a `<noscript>`-style fallback `<div>` shown if `window.Phaser`
  is undefined 3 seconds after `DOMContentLoaded`, instructing the
  visitor to check their network or run `npm start` locally.
- **Concurrency:** two NPCs targeting the same desk — desk occupation
  `Set` is checked in the NPC's "pick next destination" step; if the
  intended desk became occupied mid-walk, the NPC picks a new target
  on arrival rather than overlapping. Player walking onto an
  NPC-occupied desk — player sprite passes through (no body collision
  on desks); only NPC occupation is tracked.
- **Authorization:** N/A — fully public static page, no auth surface.
- **Resource limits:** browser tab backgrounded — Phaser pauses the
  game loop by default on visibility change; no extra handling needed.
  Tab open for hours — random-walk timers use `time.addEvent` (Phaser's
  managed timers), not raw `setInterval`, so no leak.

## Open questions (deferred)

- Should the demo include a small "now showing: <agent> is doing
  <phase>" caption synchronized to NPC state, to reinforce the
  pipeline narrative? Defer to post-launch; can be added without
  redesign.
- Does `team.bostonaholic.dev/architecture` need a 301 redirect to the
  new `ARCHITECTURE.md` on GitHub? GitHub Pages doesn't support
  server-side redirects natively without a meta-refresh `architecture.html`
  shim. Defer; only matters if the old URL is indexed.

## Risks

- **Content loss:** removing `docs/architecture.md` without first
  porting its content to `ARCHITECTURE.md` would lose the only
  long-form plugin design doc. Mitigation: the implement phase does
  the move first, deletes second, and the reviewer checks both files
  in the diff.
- **GitHub Pages cache:** GitHub Pages caches Jekyll build output; the
  switch to `.nojekyll` may take a few minutes to propagate on the
  first deploy. Low risk, no mitigation needed beyond awareness.
- **CDN supply chain:** loading Phaser from jsDelivr introduces a
  third-party runtime dependency. Mitigation: pin exact version and
  include an SRI hash; the demo degrades gracefully if the CDN is
  unreachable (see edge cases).
- **Visual quality of generated art:** a programmatic generator may
  produce uninspired pixel art that undermines the "delightful first
  impression" product goal. Mitigation: the generator script's output
  is reviewable in the PR; if it looks bad, swap to hand-crafted PNGs
  without changing any other file (the runtime only reads the PNGs,
  not the script).
- **Assumption standing in for demand:** the entire premise — that an
  animated office scene is more legible than prose for first-time
  visitors — is unvalidated. Mitigation: ship thin (no audio, no
  click interactions), measure (informal: "did people get it?"), then
  iterate.
