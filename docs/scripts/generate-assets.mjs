// Deterministic asset generator for the Phaser office demo.
//
// Produces two PNGs that the runtime loads:
//   - docs/assets/sprites/agent.png       (64x16, 4 frames of 16x16)
//   - docs/assets/backgrounds/office.png  (320x240)
//
// Idempotency is the contract: running the script twice yields byte-identical
// files. No Math.random, no Date.now, no host-dependent state. The runtime
// reads the PNGs only — this script is dev-time tooling.
//
// Style mirrors hooks/*.mjs: ESM, node: built-ins, single async main()
// invoked at end of file, fail-soft with a process.exit(1) only on a
// genuine I/O failure.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DOCS_ROOT = dirname(__dirname);

// -----------------------------------------------------------------------------
// Tiny pixel-buffer helpers. PNG.data is a flat Uint8Array of RGBA bytes;
// every helper below is a pure function over (png, x, y, color).
// -----------------------------------------------------------------------------

function setPixel(png, x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

function fillRect(png, x, y, w, h, color) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(png, x + dx, y + dy, color);
    }
  }
}

function fillAll(png, color) {
  fillRect(png, 0, 0, png.width, png.height, color);
}

// -----------------------------------------------------------------------------
// Palette (a few muted office tones — deterministic, no randomness).
// -----------------------------------------------------------------------------

const PALETTE = {
  transparent: [0, 0, 0, 0],
  skin: [232, 196, 160, 255],
  hair: [60, 40, 30, 255],
  shirt: [70, 110, 190, 255],
  pants: [50, 50, 70, 255],
  shoes: [30, 30, 30, 255],
  // Office background palette
  floor: [180, 160, 130, 255],
  floorShadow: [150, 130, 100, 255],
  wall: [210, 215, 220, 255],
  wallTrim: [170, 175, 180, 255],
  desk: [120, 80, 50, 255],
  deskTop: [160, 110, 70, 255],
  monitorFrame: [40, 40, 50, 255],
  monitorScreen: [70, 140, 200, 255],
  plantPot: [120, 70, 40, 255],
  plantLeaf: [60, 130, 70, 255],
  baseboard: [120, 100, 80, 255]
};

// -----------------------------------------------------------------------------
// Agent sprite sheet — 64x16 = 4 frames of 16x16.
//   frame 0: idle (legs together)
//   frame 1: walk pose A (left leg forward)
//   frame 2: idle (passing pose)
//   frame 3: walk pose B (right leg forward)
// Origin (0,0) is top-left of each frame; sprite faces right by default.
// -----------------------------------------------------------------------------

function drawAgentFrame(png, frameX, legPose) {
  // legPose: 'together' | 'left-forward' | 'right-forward'
  const ox = frameX; // left edge of the 16-pixel frame
  // Head (5x5) centered at column 5..9, rows 2..6
  fillRect(png, ox + 5, 2, 6, 5, PALETTE.hair);
  fillRect(png, ox + 6, 4, 4, 3, PALETTE.skin); // face
  // Torso (shirt) 4x4 at rows 7..10
  fillRect(png, ox + 6, 7, 4, 4, PALETTE.shirt);
  // Arms (2px tall) flanking the torso
  fillRect(png, ox + 5, 7, 1, 3, PALETTE.shirt);
  fillRect(png, ox + 10, 7, 1, 3, PALETTE.shirt);
  // Hands
  setPixel(png, ox + 5, 10, PALETTE.skin);
  setPixel(png, ox + 10, 10, PALETTE.skin);
  // Pants (4x3) at rows 11..13
  fillRect(png, ox + 6, 11, 4, 3, PALETTE.pants);
  // Legs / shoes (rows 14..15) vary per frame
  if (legPose === 'together') {
    fillRect(png, ox + 6, 14, 2, 2, PALETTE.pants);
    fillRect(png, ox + 8, 14, 2, 2, PALETTE.pants);
    fillRect(png, ox + 6, 15, 2, 1, PALETTE.shoes);
    fillRect(png, ox + 8, 15, 2, 1, PALETTE.shoes);
  } else if (legPose === 'left-forward') {
    // left leg (sprite's left = our +x = forward when facing right) extended
    fillRect(png, ox + 8, 13, 2, 2, PALETTE.pants);
    fillRect(png, ox + 8, 15, 2, 1, PALETTE.shoes);
    fillRect(png, ox + 5, 14, 2, 2, PALETTE.pants);
    fillRect(png, ox + 5, 15, 2, 1, PALETTE.shoes);
  } else {
    // right-forward
    fillRect(png, ox + 6, 13, 2, 2, PALETTE.pants);
    fillRect(png, ox + 6, 15, 2, 1, PALETTE.shoes);
    fillRect(png, ox + 9, 14, 2, 2, PALETTE.pants);
    fillRect(png, ox + 9, 15, 2, 1, PALETTE.shoes);
  }
}

function buildAgentSheet() {
  const png = new PNG({ width: 64, height: 16, colorType: 6 });
  fillAll(png, PALETTE.transparent);
  drawAgentFrame(png, 0, 'together');       // frame 0 — idle
  drawAgentFrame(png, 16, 'left-forward');  // frame 1 — walk A
  drawAgentFrame(png, 32, 'together');      // frame 2 — passing
  drawAgentFrame(png, 48, 'right-forward'); // frame 3 — walk B
  return png;
}

// -----------------------------------------------------------------------------
// Office background — 320x240. A single-room top-down-ish view:
//   - upper third = wall (with monitors mounted)
//   - lower two thirds = floor with two rows of three desks each
//   - plants in the corners
// All coordinates are constants so the layout is reproducible byte-for-byte.
// -----------------------------------------------------------------------------

function drawMonitor(png, x, y) {
  // 14x10 monitor with a 12x8 screen inset
  fillRect(png, x, y, 14, 10, PALETTE.monitorFrame);
  fillRect(png, x + 1, y + 1, 12, 8, PALETTE.monitorScreen);
}

function drawDesk(png, x, y) {
  // 36x18 desk: brown body + lighter top stripe
  fillRect(png, x, y, 36, 18, PALETTE.desk);
  fillRect(png, x, y, 36, 4, PALETTE.deskTop);
  // Two small pencil-cup-sized accents on top to add detail
  fillRect(png, x + 4, y + 1, 2, 2, PALETTE.monitorFrame);
  fillRect(png, x + 30, y + 1, 2, 2, PALETTE.monitorFrame);
}

function drawPlant(png, x, y) {
  // 8x12: pot (rows 8..11), leaves (rows 0..7)
  fillRect(png, x + 1, y + 8, 6, 4, PALETTE.plantPot);
  fillRect(png, x, y, 8, 8, PALETTE.plantLeaf);
  // Carve a couple of darker speckles for texture
  setPixel(png, x + 2, y + 2, PALETTE.wall);
  setPixel(png, x + 5, y + 4, PALETTE.wall);
  setPixel(png, x + 3, y + 6, PALETTE.wall);
}

function buildOfficeBackground() {
  const png = new PNG({ width: 320, height: 240, colorType: 6 });
  // Wall (top 80 rows) and floor (bottom 160 rows)
  fillRect(png, 0, 0, 320, 80, PALETTE.wall);
  fillRect(png, 0, 80, 320, 160, PALETTE.floor);
  // Wall trim and baseboard
  fillRect(png, 0, 78, 320, 2, PALETTE.wallTrim);
  fillRect(png, 0, 80, 320, 2, PALETTE.baseboard);
  // Faint floor scuff lines for texture
  for (let x = 16; x < 320; x += 32) {
    fillRect(png, x, 200, 12, 1, PALETTE.floorShadow);
  }
  // Wall monitors (six, in a row, ~y=20)
  // Spaced so they cluster above the desks below them.
  const monitorY = 18;
  const monitorXs = [22, 70, 118, 178, 226, 274];
  for (const mx of monitorXs) drawMonitor(png, mx, monitorY);
  // Two rows of three desks. Coordinates are the desk top-left corners.
  // Row 1 (y=110) and row 2 (y=180); width 36, height 18, gap 12.
  const deskRows = [110, 180];
  const deskXs = [20, 142, 264];
  for (const dy of deskRows) {
    for (const dx of deskXs) drawDesk(png, dx, dy);
  }
  // Corner plants
  drawPlant(png, 4, 92);
  drawPlant(png, 308, 92);
  drawPlant(png, 4, 222);
  drawPlant(png, 308, 222);
  return png;
}

// -----------------------------------------------------------------------------
// PNG write — pngjs's pack() emits a stream; we collect chunks and write the
// concatenated buffer. Doing the write in one shot keeps idempotency simple.
// -----------------------------------------------------------------------------

function pngToBuffer(png) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = png.pack();
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function writePng(png, outPath) {
  await mkdir(dirname(outPath), { recursive: true });
  const buf = await pngToBuffer(png);
  await writeFile(outPath, buf);
}

// -----------------------------------------------------------------------------
// main()
// -----------------------------------------------------------------------------

async function main() {
  try {
    const agentSheet = buildAgentSheet();
    const office = buildOfficeBackground();
    const agentOut = join(DOCS_ROOT, 'assets', 'sprites', 'agent.png');
    const officeOut = join(DOCS_ROOT, 'assets', 'backgrounds', 'office.png');
    await writePng(agentSheet, agentOut);
    await writePng(office, officeOut);
    // eslint-disable-next-line no-console
    console.log(`wrote ${agentOut}`);
    // eslint-disable-next-line no-console
    console.log(`wrote ${officeOut}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('generate-assets failed:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

main();
