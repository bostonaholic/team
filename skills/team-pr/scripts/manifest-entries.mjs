#!/usr/bin/env node
// Reads a capture manifest and decides whether it renders. When it does, writes
// the entries file the screenshot upload consumes.
//
// Usage: manifest-entries.mjs <artifact-dir> <entries-file>
//
// Reads <artifact-dir>/screenshots/manifest.md. It renders when its frontmatter
// `status` is `captured` or `partial` and at least one `## Captured` entry's PNG
// is a file in <artifact-dir>/screenshots/. Each entry is a `### <name>.png`
// heading with `- state:` and `- caption:` bullets.
//
// Output: one JSON object on stdout.
//   exit 0: {"decision": "render", "entries_file", "entries": <count>, "notes": [...]}
//           (entries_file absolute) and <entries-file> holds {"root", "entries": [{"path", "caption",
//           "state"}], "notes"}, entries in manifest order, paths absolute.
//   exit 1: {"decision": "capture-gap", "reason"}; nothing is written. `reason`
//           is "absent", "skipped: <status>", "no-captured-entries",
//           "pngs-missing", or "malformed: <detail>".
//
// Exit codes:
//   0  renders; <entries-file> written (replaced when it exists)
//   1  capture gap
//   2  fault: usage, or an unwritable <entries-file>
import { existsSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const USAGE = "usage: manifest-entries.mjs <artifact-dir> <entries-file>";

const RENDER_STATUSES = new Set(["captured", "partial"]);
// A capture name is one plain file name; anything else could leave the directory.
const PNG_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/;
const ENTRY_HEADING = /^###\s+(.+?)\s*$/;
const SECTION_HEADING = /^##\s+(.+?)\s*$/;
const BULLET = /^[-*]\s+(.*?)\s*$/;
const FIELD_BULLET = /^[-*]\s+(route|state|caption):\s*(.*?)\s*$/;
// The capture brief's overflow line, "N more states not captured", counts N states.
const OVERFLOW = /^(\d+) more states? not captured/;

function fail(message) {
  process.stderr.write(`manifest-entries.mjs: ${message}\n`);
  process.exit(2);
}

function parseFrontmatter(lines) {
  if (lines[0] !== "---") return { error: "no frontmatter" };
  const closing = lines.indexOf("---", 1);
  if (closing < 0) return { error: "unterminated frontmatter" };
  const fields = {};
  for (const line of lines.slice(1, closing)) {
    const match = /^([A-Za-z_]+):\s*(.*?)\s*$/.exec(line);
    if (match) fields[match[1]] = match[2];
  }
  return { fields, body: lines.slice(closing + 1) };
}

function sections(body) {
  const found = Object.create(null);
  let current = null;
  for (const line of body) {
    const heading = SECTION_HEADING.exec(line);
    if (heading) {
      current = heading[1];
      found[current] = [];
    } else if (current !== null) {
      found[current].push(line);
    }
  }
  return found;
}

function capturedEntries(lines) {
  const entries = [];
  for (const line of lines) {
    const heading = ENTRY_HEADING.exec(line);
    if (heading) {
      entries.push({ name: heading[1], fields: {} });
      continue;
    }
    const field = FIELD_BULLET.exec(line);
    if (field && entries.length > 0) entries.at(-1).fields[field[1]] = field[2];
  }
  return entries;
}

function skippedCount(lines) {
  let count = 0;
  for (const line of lines) {
    const bullet = BULLET.exec(line);
    if (!bullet) continue;
    const overflow = OVERFLOW.exec(bullet[1]);
    count += overflow ? Number(overflow[1]) : 1;
  }
  return count;
}

// Pure: manifest text plus a PNG-existence probe in, a decision out.
export function decide(manifestText, root, pngExists) {
  const gap = (reason) => ({ decision: "capture-gap", reason });
  const parsed = parseFrontmatter(manifestText.split(/\r?\n/));
  if (parsed.error) return gap(`malformed: ${parsed.error}`);
  const status = parsed.fields.status;
  if (status === undefined || status === "") return gap("malformed: no status");
  if (status.startsWith("skipped-")) return gap(`skipped: ${status}`);
  if (!RENDER_STATUSES.has(status)) return gap(`malformed: unknown status ${status}`);
  const body = sections(parsed.body);
  if (!("Captured" in body)) return gap("malformed: no ## Captured section");
  const listed = capturedEntries(body.Captured);
  if (listed.length === 0) return gap("no-captured-entries");
  for (const entry of listed) {
    if (!PNG_NAME.test(entry.name)) return gap(`malformed: entry heading ${JSON.stringify(entry.name)} is not a PNG file name`);
    if (!entry.fields.caption) return gap(`malformed: entry ${entry.name} has no caption`);
  }
  const entries = [];
  const notes = [];
  for (const entry of listed) {
    const path = join(root, entry.name);
    if (!pngExists(path)) {
      notes.push(`${entry.name} is listed in the manifest but missing from disk`);
      continue;
    }
    const rendered = { path, caption: entry.fields.caption };
    if (entry.fields.state) rendered.state = entry.fields.state;
    entries.push(rendered);
  }
  if (entries.length === 0) return gap("pngs-missing");
  if (status === "partial") notes.push(`${skippedCount(body.Skipped ?? [])} states skipped — see manifest`);
  return { decision: "render", file: { root, entries, notes } };
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function main(argv) {
  if (argv.length !== 2 || argv.some((arg) => arg === "" || arg.startsWith("-"))) fail(USAGE);
  const [artifactDir, entriesFile] = argv;
  const capturesDir = join(artifactDir, "screenshots");
  const manifest = join(capturesDir, "manifest.md");
  if (!existsSync(manifest)) {
    process.stdout.write(`${JSON.stringify({ decision: "capture-gap", reason: "absent" })}\n`);
    process.exit(1);
  }
  let text;
  try {
    text = readFileSync(manifest, "utf8");
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ decision: "capture-gap", reason: `malformed: ${error.message}` })}\n`);
    process.exit(1);
  }
  const result = decide(text, realpathSync(capturesDir), isFile);
  if (result.decision !== "render") {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(1);
  }
  if (!existsSync(dirname(entriesFile))) fail(`no directory for the entries file: ${entriesFile}`);
  // Write beside the target, then rename, so a rerun never sees a half-written file.
  const temporary = join(dirname(entriesFile), `.${basename(entriesFile)}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify(result.file, null, 2)}\n`);
    renameSync(temporary, entriesFile);
  } catch (error) {
    fail(`cannot write the entries file: ${error.message}`);
  }
  const summary = { decision: "render", entries_file: resolve(entriesFile), entries: result.file.entries.length, notes: result.file.notes };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2));
}
