# Team — Plugin Office Demo

A pixel-art Phaser 3 demo that visualizes the [Team plugin](../README.md)'s
13 specialist agents as characters wandering an office. Deployed at
[team.bostonaholic.dev](https://team.bostonaholic.dev) and served from
this `docs/` directory by GitHub Pages.

## Run it

### Zero install (CDN)

Open `docs/index.html` directly in any modern browser. Phaser loads
from jsDelivr; nothing else is needed.

### Local with live-reload

```sh
cd docs
npm install
npm start
```

This launches [`live-server`](https://www.npmjs.com/package/live-server)
at <http://localhost:8080>, opens the demo automatically, and
auto-reloads on file changes.

### Regenerate the pixel art

The two PNGs under `docs/assets/` are produced by a deterministic
generator. To regenerate them (re-running yields byte-identical output):

```sh
cd docs
npm run generate-assets
```

## Controls

Arrow keys or WASD move the player-controlled agent (the one without
a colored tint). The other twelve agents wander between desks on their
own — each picks a free desk, walks to it, "works" for 4-6 seconds,
then releases the desk and picks the next one.

## The 13 characters

Each on-screen character maps 1:1 to one of the plugin's 13 specialist
agents, listed in [`skills/team/registry.json`](../skills/team/registry.json).
The character labels stay above each sprite for easy identification. The
agents and the QRSPI phases they serve:

- **questioner** — Phase 1 (QUESTION). Decomposes user intent into a
  task and clarifying questions. Player-controlled in this demo.
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
