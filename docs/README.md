# Team — Plugin Office Demo

A pixel-art Phaser 3 demo that visualizes the [Team plugin](../README.md)'s
orchestrator and its 13 specialist agents as characters in an office.
The player character is **You** — the orchestrator session that walks the
QRSPI phase table — and the 13 NPCs are the specialist agents wandering
between desks. Native canvas is 640×480 and renders at 1280×960 (2× zoom)
for crisp pixels. Deployed at
[team.bostonaholic.dev](https://team.bostonaholic.dev) and served from
this `docs/` directory by GitHub Pages.

## Run it

```sh
cd docs
npm install
npm start
```

This launches [`live-server`](https://www.npmjs.com/package/live-server)
at <http://localhost:8080>, opens the demo automatically, and
auto-reloads on file changes. Phaser itself is delivered from jsDelivr,
so `npm install` only pulls the dev server.

(Opening `docs/index.html` directly over `file://` is not supported —
browsers vary in whether they allow Phaser's loader to fetch the
`assets/` PNGs from disk, and Chrome blocks it outright.)

### Regenerate the pixel art

The pixel-art PNGs under `docs/assets/sprites/` and
`docs/assets/backgrounds/`, plus the 16x16 `docs/favicon.png`, are
produced by a deterministic generator. To regenerate them (re-running
yields byte-identical output):

```sh
cd docs
npm run generate-assets
```

## Controls

Arrow keys or WASD move the player character — labeled **You** and
rendered without a tint at canvas center — around the office. The 13
tinted NPCs wander between desks on their own: each picks a free desk,
walks to it, "works" for 4-6 seconds, then releases the desk and picks
the next one. Always-on name labels (12px sans-serif) sit above every
sprite so each character is identifiable at a glance.

## You + 13 NPCs

The player character represents **You** — the orchestrator session (the
user-controlled Claude Code session that walks the QRSPI phase table).
The 13 NPCs are the plugin's specialist agents, one each, listed in
[`skills/team/registry.json`](../skills/team/registry.json). Total
characters on screen: 14 (1 player + 13 NPCs). Each NPC has a distinct
tint so no two agents share a color. The agents and the QRSPI phases
they serve:

- **questioner** — Phase 1 (QUESTION). Decomposes user intent into a
  task and clarifying questions.
- **file-finder** — Phase 2 (RESEARCH). Locates relevant files in the
  codebase, isolated from the user's framing.
- **researcher** — Phase 2 (RESEARCH). Reads the located files and
  drafts a research artifact.
- **design-author** — Phase 3 (DESIGN). Drafts a ~200-line alignment
  doc; first human gate.
- **structure-planner** — Phase 4 (STRUCTURE). Breaks the design into
  vertical slices; second human gate.
- **planner** — Phase 5 (PLAN). Derives a tactical, file-level plan
  from the approved structure.
- **test-architect** — Phase 7 (IMPLEMENT). Writes the failing
  acceptance tests that pin down the scope fence.
- **implementer** — Phase 7 (IMPLEMENT). Executes the plan slice by
  slice, committing each atomically.
- **code-reviewer** — Phase 7 (IMPLEMENT). Adversarial code-quality
  review.
- **security-reviewer** — Phase 7 (IMPLEMENT). Adversarial security
  audit.
- **technical-writer** — Phase 7 (IMPLEMENT). Reviews docs, comments,
  and commit messages for clarity.
- **ux-reviewer** — Phase 7 (IMPLEMENT). User-experience review of
  the resulting feature.
- **verifier** — Phase 7 (IMPLEMENT). Re-runs the test suite and
  confirms the slice contract holds.

For the full pipeline architecture, see
[`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## What this demo is not

This is a deliberate thin slice. It does not include audio, click-to-
send-agent-to-desk interaction, mobile or touch controls, or a screen-
reader accessible story. Those are deferred until real user reaction
suggests they're worth the complexity.
