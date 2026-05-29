// Deterministic asset generator for the Phaser office demo.
//
// Produces three PNGs that the runtime loads:
//   - docs/assets/sprites/agent.png       (64x16, 4 frames of 16x16)
//   - docs/assets/backgrounds/office.png  (640x480)
//   - docs/favicon.png                    (16x16, reuses agent frame 0)
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
  plantLeafDark: [40, 100, 50, 255],
  baseboard: [120, 100, 80, 255],
  // Wall accents
  whiteboardFrame: [90, 90, 100, 255],
  whiteboardSurface: [240, 240, 235, 255],
  whiteboardInk: [60, 90, 160, 255],
  coffeeCounter: [80, 60, 45, 255],
  coffeeCounterTop: [110, 85, 65, 255],
  coffeeMachine: [50, 50, 55, 255],
  coffeeMachineTrim: [200, 60, 60, 255],
  mug: [220, 220, 220, 255]
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

// 16x16 favicon — reuses the agent sprite's idle pose (frame 0) so the
// browser tab icon matches the on-screen player. Identical pixel buffer
// to the first 16 columns of the agent sheet, ensuring visual identity
// across the runtime and tab icon.
function buildFavicon() {
  const png = new PNG({ width: 16, height: 16, colorType: 6 });
  fillAll(png, PALETTE.transparent);
  drawAgentFrame(png, 0, 'together');
  return png;
}

// -----------------------------------------------------------------------------
// Office background — 640x480. A single-room top-down-ish view:
//   - upper third (rows 0..160) = wall with mounted monitors, a whiteboard,
//     and a coffee station
//   - lower two thirds (rows 160..480) = floor with 3 rows of 5 desks
//   - potted plants in the four corners
// All coordinates are constants so the layout is reproducible byte-for-byte.
// Desk top-left coordinates here must match the DESKS hitboxes in
// docs/src/main.js so NPCs sit on the painted desks rather than empty floor.
// -----------------------------------------------------------------------------

const WORLD_WIDTH = 640;
const WORLD_HEIGHT = 480;
const WALL_HEIGHT = 160; // top 1/3 of the canvas

function drawMonitor(png, x, y) {
  // 24x18 wall-mounted monitor: dark frame with a blue screen inset and
  // a small base/stand peg at the bottom.
  fillRect(png, x, y, 24, 18, PALETTE.monitorFrame);
  fillRect(png, x + 2, y + 2, 20, 12, PALETTE.monitorScreen);
  // Tiny "power" pixel in the bottom-right of the screen for character
  setPixel(png, x + 20, y + 12, PALETTE.coffeeMachineTrim);
  // Stand peg below the monitor
  fillRect(png, x + 10, y + 18, 4, 2, PALETTE.monitorFrame);
}

function drawDesk(png, x, y) {
  // 48x24 desk: brown body + lighter top stripe.
  fillRect(png, x, y, 48, 24, PALETTE.desk);
  fillRect(png, x, y, 48, 6, PALETTE.deskTop);
  // Small monitor on the desk surface to suggest a workstation
  fillRect(png, x + 18, y + 2, 12, 6, PALETTE.monitorFrame);
  fillRect(png, x + 19, y + 3, 10, 4, PALETTE.monitorScreen);
  // Two pencil-cup accents at the corners of the desk top
  fillRect(png, x + 4, y + 2, 3, 3, PALETTE.coffeeMachineTrim);
  fillRect(png, x + 41, y + 2, 3, 3, PALETTE.coffeeMachineTrim);
  // Drawer line across the front face
  fillRect(png, x + 2, y + 14, 44, 1, PALETTE.deskTop);
}

function drawPlant(png, x, y) {
  // 16x24: pot (rows 16..23) and leaves (rows 0..15).
  fillRect(png, x + 2, y + 16, 12, 8, PALETTE.plantPot);
  // Pot rim
  fillRect(png, x + 1, y + 16, 14, 2, PALETTE.deskTop);
  // Bushy leaves — main mass + a few darker shadow speckles for depth
  fillRect(png, x, y + 2, 16, 14, PALETTE.plantLeaf);
  // Trim the top corners to soften the leaf shape
  fillRect(png, x, y + 2, 2, 2, PALETTE.transparent);
  fillRect(png, x + 14, y + 2, 2, 2, PALETTE.transparent);
  // Shadow speckles
  fillRect(png, x + 3, y + 5, 2, 2, PALETTE.plantLeafDark);
  fillRect(png, x + 10, y + 4, 2, 2, PALETTE.plantLeafDark);
  fillRect(png, x + 6, y + 9, 2, 2, PALETTE.plantLeafDark);
  fillRect(png, x + 11, y + 11, 2, 2, PALETTE.plantLeafDark);
}

function drawWhiteboard(png, x, y) {
  // 56x36 whiteboard mounted on the wall.
  fillRect(png, x, y, 56, 36, PALETTE.whiteboardFrame);
  fillRect(png, x + 2, y + 2, 52, 32, PALETTE.whiteboardSurface);
  // Sketch a few "writing" strokes (horizontal and a small diagram)
  fillRect(png, x + 6, y + 7, 30, 1, PALETTE.whiteboardInk);
  fillRect(png, x + 6, y + 11, 22, 1, PALETTE.whiteboardInk);
  fillRect(png, x + 6, y + 15, 18, 1, PALETTE.whiteboardInk);
  // Little box + arrow on the right
  fillRect(png, x + 38, y + 18, 10, 8, PALETTE.whiteboardInk);
  fillRect(png, x + 32, y + 22, 6, 1, PALETTE.whiteboardInk);
  // Marker tray under the board
  fillRect(png, x + 4, y + 33, 48, 2, PALETTE.whiteboardFrame);
}

function drawCoffeeStation(png, x, y) {
  // 56x40 counter + machine + mug, occupying the wall corner.
  // Counter body
  fillRect(png, x, y + 16, 56, 24, PALETTE.coffeeCounter);
  fillRect(png, x, y + 16, 56, 4, PALETTE.coffeeCounterTop);
  // Espresso machine
  fillRect(png, x + 6, y, 20, 16, PALETTE.coffeeMachine);
  fillRect(png, x + 8, y + 2, 16, 4, PALETTE.coffeeMachineTrim);
  // Spout
  fillRect(png, x + 14, y + 12, 4, 2, PALETTE.mug);
  // Mug on counter
  fillRect(png, x + 36, y + 6, 8, 10, PALETTE.mug);
  fillRect(png, x + 44, y + 9, 2, 4, PALETTE.mug); // handle
  fillRect(png, x + 37, y + 7, 6, 2, PALETTE.coffeeCounter); // coffee top
}

function buildOfficeBackground() {
  const png = new PNG({ width: WORLD_WIDTH, height: WORLD_HEIGHT, colorType: 6 });
  // Wall (top 160 rows) and floor (bottom 320 rows)
  fillRect(png, 0, 0, WORLD_WIDTH, WALL_HEIGHT, PALETTE.wall);
  fillRect(png, 0, WALL_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT - WALL_HEIGHT, PALETTE.floor);
  // Wall trim and baseboard at the wall/floor transition
  fillRect(png, 0, WALL_HEIGHT - 4, WORLD_WIDTH, 4, PALETTE.wallTrim);
  fillRect(png, 0, WALL_HEIGHT, WORLD_WIDTH, 4, PALETTE.baseboard);
  // Faint floor scuff lines for texture — three rows of dashes
  for (const scuffY of [250, 340, 430]) {
    for (let x = 24; x < WORLD_WIDTH; x += 48) {
      fillRect(png, x, scuffY, 18, 1, PALETTE.floorShadow);
    }
  }
  // Wall monitors — five, one above each desk column. Centered at desk
  // column centers (56, 188, 320, 452, 584) so they line up with the
  // workstation grid below.
  const monitorY = 50;
  const monitorXs = [44, 176, 308, 440, 572]; // monitor x-left = column_center - 12
  for (const mx of monitorXs) drawMonitor(png, mx, monitorY);
  // Whiteboard between monitors 1 and 2 (low on the wall, doesn't fight
  // the monitor row)
  drawWhiteboard(png, 100, 90);
  // Coffee station between monitors 4 and 5
  drawCoffeeStation(png, 380, 110);
  // Three rows of five desks. Coordinates are the desk top-left corners,
  // matching the DESKS hitboxes in docs/src/main.js.
  const deskRows = [200, 290, 380];
  const deskXs = [32, 164, 296, 428, 560];
  for (const dy of deskRows) {
    for (const dx of deskXs) drawDesk(png, dx, dy);
  }
  // Corner plants — four corners, just inside the floor band
  drawPlant(png, 4, 170);          // top-left of floor
  drawPlant(png, WORLD_WIDTH - 20, 170);   // top-right
  drawPlant(png, 4, WORLD_HEIGHT - 28);    // bottom-left
  drawPlant(png, WORLD_WIDTH - 20, WORLD_HEIGHT - 28); // bottom-right
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
    const favicon = buildFavicon();
    const agentOut = join(DOCS_ROOT, 'assets', 'sprites', 'agent.png');
    const officeOut = join(DOCS_ROOT, 'assets', 'backgrounds', 'office.png');
    const faviconOut = join(DOCS_ROOT, 'favicon.png');
    await writePng(agentSheet, agentOut);
    await writePng(office, officeOut);
    await writePng(favicon, faviconOut);
    // eslint-disable-next-line no-console
    console.log(`wrote ${agentOut}`);
    // eslint-disable-next-line no-console
    console.log(`wrote ${officeOut}`);
    // eslint-disable-next-line no-console
    console.log(`wrote ${faviconOut}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('generate-assets failed:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

main();
