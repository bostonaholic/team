---
topic: phaser-office-demo
date: 2026-05-28
phase: task
ticketId: null
---

# Task: phaser-office-demo

## Description

Add a Phaser 3 pixel-art interactive demo to this repo that visualizes the team plugin's
specialist agents walking around a tech-startup office and "doing work." The demo is a static,
no-build-step webpage that lives under `docs/` (NOT a separate `demo-phaser-office/` folder)
so it deploys as the **primary public website at https://team.bostonaholic.dev** via GitHub
Pages (replacing the current Jekyll site).

### Required files (exact names, all under `docs/`)

- `index.html` — loads Phaser via CDN/node_modules and `src/main.js`
- `src/main.js` — preload / create / update + agent behaviors
- `assets/sprites/agent.png` — 64x16 sprite sheet (4 frames × 16x16)
- `assets/backgrounds/office.png` — 320x240 background
- `package.json` — `"start": "live-server --port=8080 --open=./index.html"`, deps: `phaser` + `live-server`
- `README.md` — install/run instructions + paragraph mapping the visualization to the team plugin

### Canvas / rendering

- 320×240, `pixelArt: true`, `cameras.main.setZoom(2)` for crisp pixel scaling

### Agents / sprites

- Single sprite sheet (`assets/sprites/agent.png`): 4 frames × 16×16, total 64×16
- Arcade physics, no gravity, collide with world bounds
- Player agent: arrow keys / WASD; NPCs: random walk or patrol
- Animations: `idle` (frame 0), `walk` (frames 0–3 @ ~8 fps); flip horizontally for left
- Body: `setSize(12,14).setOffset(2,1)` (or similar)
- State indicators above head: "working" when at desk, "walking" when moving

### Office layout

- Static background (`assets/backgrounds/office.png`, 320×240) depicting desks, plants, monitors
- Several desk areas where NPCs go to "work" for a few seconds
- Occupation flag so two agents cannot share a desk

### Assets

- All assets included in the repo; user does not supply art

### Optional extras

- Name labels above sprites
- Click-to-send-agent-to-desk
- Footstep / chime sounds

### Testing checklist

- `npm install` succeeds
- `npm run start` launches live-server at :8080
- Player animates and moves with arrow keys / WASD
- NPCs wander, go to desks, show "working" indicator
- No missing-asset 404s, no console errors

## Stated goal

Replace the current Jekyll docs site with an interactive pixel-art demo that serves as
team.bostonaholic.dev's public landing experience, running purely as a static HTML/JS page.

## Inferred goal

Give developers who land on team.bostonaholic.dev an immediately legible, delightful mental model
of how the team plugin works — the 13 specialist agents as characters doing distinct work in an
office — so they understand the product's value proposition before reading a word of prose.

The audience is a developer who has just heard about the team plugin, clicked the link, and has
not yet read the README. They should walk away understanding: (a) the plugin orchestrates multiple
specialized agents, (b) agents operate autonomously and hand off to each other, (c) there is a
human approval gate. The demo is the top-of-funnel hook; documentation is the follow-through.

## Acceptance signals

- A developer can open `docs/index.html` locally (or visit team.bostonaholic.dev) and
  immediately see agents moving around the office without reading any instructions.
- The demo correctly replaces, rather than conflicts with, the Jekyll pipeline — no Jekyll
  build is needed for the static assets, and the GitHub Pages deployment picks up `docs/`
  as the root.
- The README's mapping paragraph makes the connection to the plugin explicit enough that a
  newcomer reading only that paragraph understands what the characters represent.
- `npm install && npm run start` works from the `docs/` directory without errors.

## Open assumptions

- The current Jekyll site (`docs/index.md`, `_config.yml`, Gemfile) will be removed or
  superseded — this task assumes that is intentional.
- GitHub Pages is the deployment mechanism; this is inferred from the existing CNAME file
  (`team.bostonaholic.dev`) in `docs/` and the Jekyll setup pointing at the same URL.
- "No build step" means no bundler (Webpack, Vite, etc.); Phaser via CDN or a pre-bundled
  `node_modules` copy is acceptable.
- All bitmap assets (sprite sheet, background) must be generated programmatically or
  synthetically — the repo has no existing pixel-art assets.
- The repo's existing `package.json` at the root (Bun, `"type": "module"`, no scripts)
  is unrelated; the demo gets its own `package.json` under `docs/`.
