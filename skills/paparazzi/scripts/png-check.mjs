#!/usr/bin/env node

/**
 * Mechanical gates for a captured frame.
 *
 *     node "<skill-dir>/scripts/png-check.mjs" <png>
 *
 * Prints one JSON object. Exit 0: every gate passed. 1: a gate failed, named in
 * `failures`. 2: the file is unreadable, not a PNG, or a PNG shape this decoder
 * does not model (anything but 8-bit, non-interlaced), reported on stderr.
 *
 * Decodes with `node:zlib` alone, so it runs where no image library is installed.
 */

import { readFileSync, realpathSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { pathToFileURL } from "node:url";

/** GitHub's attachment bound; a larger frame cannot reach a PR body. */
export const MAX_BYTES = 10 * 1024 * 1024;

/** A frame this close to one color is flagged for a hard look, never failed: an empty state can be this sparse. */
export const SPARSE_SHARE = 0.995;

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export class PngError extends Error {}

function readChunks(buffer) {
  if (buffer.length < SIGNATURE.length || !buffer.subarray(0, SIGNATURE.length).equals(SIGNATURE)) {
    throw new PngError("not a PNG file");
  }
  const chunks = [];
  let offset = SIGNATURE.length;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (data.length !== length) throw new PngError(`truncated ${type} chunk`);
    chunks.push({ type, data });
    if (type === "IEND") return chunks;
    offset += 12 + length;
  }
  throw new PngError("missing IEND chunk");
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

function unfilter(raw, height, stride, bytesPerPixel) {
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    if (filter > 4) throw new PngError(`unknown filter type ${filter} on row ${y}`);
    for (let x = 0; x < stride; x++) {
      const left = x >= bytesPerPixel ? out[x - bytesPerPixel] : 0;
      const up = prior[x];
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) predicted = paeth(left, up, x >= bytesPerPixel ? prior[x - bytesPerPixel] : 0);
      out[x] = (line[x] + predicted) & 0xff;
    }
  }
  return pixels;
}

/** Decodes a PNG into `{ width, height, rgba }`, one packed 0xRRGGBBAA value per pixel. */
export function decodePng(buffer) {
  const chunks = readChunks(buffer);
  const header = chunks[0]?.type === "IHDR" ? chunks[0].data : null;
  if (!header || header.length !== 13) throw new PngError("missing IHDR chunk");

  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const [bitDepth, colorType, , , interlace] = header.subarray(8, 13);
  const channels = CHANNELS[colorType];
  if (!channels) throw new PngError(`unsupported color type ${colorType}`);
  if (bitDepth !== 8) throw new PngError(`unsupported bit depth ${bitDepth}`);
  if (interlace !== 0) throw new PngError("unsupported interlaced PNG");

  const palette = chunks.find((chunk) => chunk.type === "PLTE")?.data;
  if (colorType === 3 && !palette) throw new PngError("palette PNG without PLTE chunk");

  const stride = width * channels;
  let raw;
  try {
    raw = inflateSync(Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data)));
  } catch (error) {
    throw new PngError(`corrupt image data: ${error.message}`);
  }
  if (raw.length < height * (stride + 1)) throw new PngError("image data shorter than its dimensions");

  const pixels = unfilter(raw, height, stride, channels);
  const rgba = new Uint32Array(width * height);
  for (let index = 0; index < rgba.length; index++) {
    const at = index * channels;
    let red, green, blue;
    let alpha = 255;
    if (colorType === 3) {
      const entry = pixels[at] * 3;
      red = palette[entry];
      green = palette[entry + 1];
      blue = palette[entry + 2];
    } else if (channels <= 2) {
      red = green = blue = pixels[at];
      if (channels === 2) alpha = pixels[at + 1];
    } else {
      red = pixels[at];
      green = pixels[at + 1];
      blue = pixels[at + 2];
      if (channels === 4) alpha = pixels[at + 3];
    }
    rgba[index] = ((red << 24) | (green << 16) | (blue << 8) | alpha) >>> 0;
  }
  return { width, height, rgba };
}

/** The single-frame gates: a readable size, not one flat color, and under the attachment bound. */
export function inspect(buffer) {
  const { width, height, rgba } = decodePng(buffer);
  const counts = new Map();
  let dominant = 0;
  for (const color of rgba) {
    const count = (counts.get(color) ?? 0) + 1;
    counts.set(color, count);
    if (count > dominant) dominant = count;
  }
  const dominantShare = rgba.length ? dominant / rgba.length : 1;

  const failures = [];
  if (width === 0 || height === 0) failures.push("zero-size frame");
  if (counts.size <= 1) failures.push("blank frame: a single flat color");
  if (buffer.length > MAX_BYTES) failures.push(`${buffer.length} bytes exceeds the ${MAX_BYTES}-byte attachment bound`);

  return {
    width,
    height,
    bytes: buffer.length,
    colors: counts.size,
    dominantShare: Number(dominantShare.toFixed(4)),
    sparse: dominantShare >= SPARSE_SHARE,
    failures,
  };
}

function main(argv) {
  const [path, ...rest] = argv;
  if (!path || rest.length) {
    process.stderr.write("png-check.mjs: usage: png-check.mjs <png>\n");
    return 2;
  }
  try {
    const report = { file: path, ...inspect(readFileSync(path)) };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.failures.length ? 1 : 0;
  } catch (error) {
    process.stderr.write(`png-check.mjs: ${error.message}\n`);
    return 2;
  }
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
