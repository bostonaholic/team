import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { MAX_BYTES, decodePng, inspect } from "../skills/paparazzi/scripts/png-check.mjs";
import { DEFAULT_CONTEXT, InputError, planFrames } from "../skills/paparazzi/scripts/shoot.mjs";

const PNG_CHECK = resolve("skills/paparazzi/scripts/png-check.mjs");
const SHOOT = resolve("skills/paparazzi/scripts/shoot.mjs");

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const [a, b, c] = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upLeft)];
  if (a <= b && a <= c) return left;
  return b <= c ? up : upLeft;
}

/** Encodes `rows` (arrays of per-pixel channel arrays) cycling filter types 0-4 by row, so decoding exercises every filter. */
function encodePng(rows, { colorType = 6, palette } = {}) {
  const channels = { 0: 1, 2: 3, 3: 1, 6: 4 }[colorType];
  const width = rows[0].length;
  const raw = rows.map((row) => Buffer.from(row.flat()));
  const lines = raw.map((line, y) => {
    const filter = y % 5;
    const prior = y > 0 ? raw[y - 1] : Buffer.alloc(line.length);
    const out = Buffer.alloc(line.length + 1);
    out[0] = filter;
    for (let x = 0; x < line.length; x++) {
      const left = x >= channels ? line[x - channels] : 0;
      const upLeft = x >= channels ? prior[x - channels] : 0;
      const predicted = [0, left, prior[x], (left + prior[x]) >> 1, paeth(left, prior[x], upLeft)][filter];
      out[x + 1] = (line[x] - predicted) & 0xff;
    }
    return out;
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(rows.length, 4);
  header[8] = 8;
  header[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    ...(palette ? [chunk("PLTE", Buffer.from(palette.flat()))] : []),
    chunk("IDAT", deflateSync(Buffer.concat(lines))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function grid(width, height, pixel) {
  return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => pixel(x, y)));
}

const WHITE = [255, 255, 255, 255];
const INK = [17, 24, 39, 255];

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), "paparazzi-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function run(script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", ...options });
}

test("decodePng reverses every filter type for RGBA, RGB, gray, and palette images", () => {
  const rgba = grid(7, 10, (x, y) => [(x * 37) & 0xff, (y * 53) & 0xff, (x * y * 11) & 0xff, 255 - x]);
  const decoded = decodePng(encodePng(rgba));
  assert.equal(decoded.width, 7);
  assert.equal(decoded.height, 10);
  assert.equal(decoded.rgba[3 * 7 + 4], ((4 * 37) << 24 | (3 * 53) << 16 | (4 * 3 * 11) << 8 | (255 - 4)) >>> 0);

  const rgb = decodePng(encodePng(grid(3, 6, (x) => [x * 80, 0, 0]), { colorType: 2 }));
  assert.equal(rgb.rgba[2], (160 << 24 | 255) >>> 0);

  const gray = decodePng(encodePng(grid(2, 5, (x, y) => [x + y * 10]), { colorType: 0 }));
  assert.equal(gray.rgba[4 * 2 + 1], (41 << 24 | 41 << 16 | 41 << 8 | 255) >>> 0);

  const palette = decodePng(encodePng(grid(2, 5, (x) => [x]), { colorType: 3, palette: [[1, 2, 3], [4, 5, 6]] }));
  assert.equal(palette.rgba[1], (4 << 24 | 5 << 16 | 6 << 8 | 255) >>> 0);
});

test("inspect fails a single-color frame and flags a near-uniform one as sparse", () => {
  const blank = inspect(encodePng(grid(20, 20, () => WHITE)));
  assert.equal(blank.colors, 1);
  assert.equal(blank.failures.length, 1);

  const sparse = inspect(encodePng(grid(100, 100, (x, y) => (x === 5 && y === 5 ? INK : WHITE))));
  assert.deepEqual(sparse.failures, []);
  assert.equal(sparse.sparse, true);

  const busy = inspect(encodePng(grid(10, 10, (x) => (x < 5 ? INK : WHITE))));
  assert.equal(busy.sparse, false);
  assert.equal(busy.dominantShare, 0.5);
});

test("inspect fails a frame over the attachment bound", () => {
  const png = encodePng(grid(4, 4, (x) => (x ? INK : WHITE)));
  const padded = Buffer.concat([png, Buffer.alloc(MAX_BYTES)]);
  assert.match(inspect(padded).failures.join(), new RegExp(String(MAX_BYTES)));
});

test("png-check exits 0 on a passing frame, 1 on a failed gate, and 2 on a non-PNG or bad usage", (t) => {
  const dir = scratch(t);
  const frame = join(dir, "frame.png");
  const blank = join(dir, "blank.png");
  const text = join(dir, "notes.png");
  writeFileSync(frame, encodePng(grid(6, 6, (x) => (x ? WHITE : INK))));
  writeFileSync(blank, encodePng(grid(6, 6, () => WHITE)));
  writeFileSync(text, "not an image");

  const passing = run(PNG_CHECK, [frame]);
  assert.equal(passing.status, 0, passing.stderr);
  assert.deepEqual(JSON.parse(passing.stdout).failures, []);

  const failing = run(PNG_CHECK, [blank]);
  assert.equal(failing.status, 1);
  assert.equal(JSON.parse(failing.stdout).failures.length, 1);

  assert.equal(run(PNG_CHECK, [text]).status, 2);
  assert.equal(run(PNG_CHECK, [frame, "extra"]).status, 2);
  assert.equal(run(PNG_CHECK, []).status, 2);
});

test("planFrames expands a shot list into one frame per shot under shared defaults", () => {
  const frames = planFrames(
    {
      origin: "http://127.0.0.1:4100/docs/",
      defaults: { colorScheme: "dark" },
      shots: [
        { name: "01-settings-populated", path: "/settings", viewport: { width: 390, height: 844 } },
        { name: "02-pricing-populated", path: "/pricing", fullPage: true },
        { name: "03-escape-populated", path: "//evil.example/" },
      ],
    },
    "/out",
  );
  assert.deepEqual(
    frames.map(({ name, url, file }) => [name, url, file]),
    [
      ["01-settings-populated", "http://127.0.0.1:4100/docs/settings", join("/out", "01-settings-populated.png")],
      ["02-pricing-populated", "http://127.0.0.1:4100/docs/pricing", join("/out", "02-pricing-populated.png")],
      ["03-escape-populated", "http://127.0.0.1:4100/docs//evil.example/", join("/out", "03-escape-populated.png")],
    ],
  );
  assert.deepEqual(frames[0].context, { ...DEFAULT_CONTEXT, colorScheme: "dark", viewport: { width: 390, height: 844 } });
  assert.deepEqual(frames[1].context, { ...DEFAULT_CONTEXT, colorScheme: "dark" });
});

test("planFrames refuses an unusable shot list before anything launches", () => {
  const origin = "http://127.0.0.1:4100";
  const refusals = [
    [{ shots: [{ name: "01-a", path: "/" }] }, /origin/],
    [{ origin, shots: [{ name: "01-a", path: "/", sides: ["after"] }] }, /unknown field/],
    [{ origin, shots: [{ name: "settings", path: "/" }] }, /name/],
    [{ origin, shots: [{ name: "01-a", path: "/" }, { name: "01-a", path: "/b" }] }, /duplicate name/],
    [{ origin, shots: [{ name: "01-a", path: "relative" }] }, /start with/],
    [{ origin, shots: [{ name: "01-a", path: "/", actions: [{ fill: "#q" }] }] }, /string value/],
    [{ origin, shots: [{ name: "01-a", path: "/", actions: [{ drag: "#q" }] }] }, /unknown action/],
    [{ origin, shots: [{ name: "01-a", path: "/", target: { role: "button", nth: 2 } }] }, /locator/],
    [{ origin, shots: [{ name: "01-a", path: "/", fullPage: true, target: "#card" }] }, /exclusive/],
    [{ origin, shots: [{ name: "01-a", path: "/", deviceScaleFactor: 4 }] }, /deviceScaleFactor/],
    [{ origin: "file:///etc", shots: [{ name: "01-a", path: "/" }] }, /http/],
    [{ origin, shots: [] }, /non-empty/],
  ];
  for (const [list, message] of refusals) {
    assert.throws(() => planFrames(list, "/out"), (error) => error instanceof InputError && message.test(error.message), JSON.stringify(list));
  }
});

test("shoot exits 2 on an unusable list and 3 when no Playwright resolves", (t) => {
  const dir = scratch(t);
  const env = { ...process.env, PAPARAZZI_TOOLS: "" };
  const bad = join(dir, "bad.json");
  const good = join(dir, "good.json");
  writeFileSync(bad, "{ not json");
  writeFileSync(good, JSON.stringify({ origin: "http://127.0.0.1:9", shots: [{ name: "01-home-populated", path: "/" }] }));

  const unusable = run(SHOOT, [bad, join(dir, "out")], { cwd: dir, env });
  assert.equal(unusable.status, 2);
  assert.match(unusable.stderr, /^shoot\.mjs: /);

  const noTool = run(SHOOT, [good, join(dir, "out")], { cwd: dir, env });
  assert.equal(noTool.status, 3);
  assert.equal(run(SHOOT, [], { cwd: dir, env }).status, 2);
});

function playwrightAvailable() {
  for (const base of [process.env.PAPARAZZI_TOOLS, process.cwd()].filter(Boolean)) {
    try {
      createRequire(join(resolve(base), "package.json")).resolve("playwright");
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

function serve(t, html) {
  const server = createServer((request, response) => {
    const found = request.url === "/";
    response.writeHead(found ? 200 : 404, { "content-type": "text/html" });
    response.end(found ? html : "<p>missing</p>");
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done(`http://127.0.0.1:${server.address().port}`)));
}

/** Async, because a synchronous spawn would block the event loop serving the origins. */
function shootAsync(list, outDir) {
  return new Promise((done) => {
    execFile(process.execPath, [SHOOT, list, outDir], (error, stdout, stderr) => done({ status: error?.code ?? 0, stdout, stderr }));
  });
}

test("shoot captures viewport, element, and full-page frames and fails an error page", { skip: !playwrightAvailable() && "no playwright package resolves" }, async (t) => {
  const dir = scratch(t);
  const origin = await serve(t, `<!doctype html><body style="margin:0;font:16px sans-serif"><h1>Settings</h1><button>Save</button><div style="height:900px"></div><p>Footer</p></body>`);
  const list = join(dir, "shots.json");
  writeFileSync(
    list,
    JSON.stringify({
      origin,
      defaults: { deviceScaleFactor: 1, viewport: { width: 400, height: 300 } },
      shots: [
        { name: "01-settings-populated", path: "/" },
        { name: "02-settings-button", path: "/", target: { role: "button", name: "Save" } },
        { name: "03-settings-full", path: "/", fullPage: true },
        { name: "04-missing-error", path: "/missing" },
      ],
    }),
  );

  const shot = await shootAsync(list, join(dir, "out"));
  assert.equal(shot.status, 1, shot.stderr);
  const frames = Object.fromEntries(JSON.parse(shot.stdout).frames.map((frame) => [frame.name, frame]));
  const size = (name) => {
    const { width, height } = decodePng(readFileSync(frames[name].file));
    return [width, height];
  };

  assert.equal(frames["01-settings-populated"].file, join(dir, "out", "01-settings-populated.png"));
  assert.deepEqual(size("01-settings-populated"), [400, 300]);
  assert.ok(size("02-settings-button")[0] < 200, JSON.stringify(size("02-settings-button")));
  assert.ok(size("03-settings-full")[1] > 900);
  assert.equal(frames["04-missing-error"].ok, false);
  assert.equal(frames["04-missing-error"].file, null);
  assert.match(frames["04-missing-error"].reason, /HTTP 404/);
});
