// Runs skills/team-pr/scripts/manifest-entries.mjs against scratch capture directories.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = resolve("skills/team-pr/scripts/manifest-entries.mjs");

function scratch(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "manifest-entries-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const artifact = join(root, "artifact");
  const shots = join(artifact, "screenshots");
  mkdirSync(shots, { recursive: true });
  const entriesFile = join(root, "entries.json");
  return {
    shots,
    entriesFile,
    manifest: (text) => writeFileSync(join(shots, "manifest.md"), text),
    png: (name) => writeFileSync(join(shots, name), "png"),
    run: (args = [artifact, entriesFile]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" }),
  };
}

const frontmatter = (status) => `---\ntopic: demo\ndate: 2026-10-01\nphase: implement\nround: 1\nstatus: ${status}\nseeded: true\n---\n`;

const entry = (name, state, caption) => `\n### ${name}\n\n- route: /login\n- state: ${state}\n- caption: ${caption}\n`;

const CAPTURED = `## Captured\n${entry("01-login-populated.png", "populated", "The login form.")}${entry("02-login-error.png", "error", "The error state.")}\n## Skipped\n`;

function gap(run) {
  assert.equal(run.status, 1, `exit ${run.status}: ${run.stderr}`);
  return JSON.parse(run.stdout);
}

test("a captured manifest renders and writes the entries file in manifest order", (t) => {
  const s = scratch(t);
  s.manifest(frontmatter("captured") + CAPTURED);
  s.png("01-login-populated.png");
  s.png("02-login-error.png");
  const run = s.run();
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), { decision: "render", entries_file: s.entriesFile, entries: 2, notes: [] });
  assert.deepEqual(JSON.parse(readFileSync(s.entriesFile, "utf8")), {
    root: s.shots,
    entries: [
      { path: join(s.shots, "01-login-populated.png"), caption: "The login form.", state: "populated" },
      { path: join(s.shots, "02-login-error.png"), caption: "The error state.", state: "error" },
    ],
    notes: [],
  });
});

test("an entry whose PNG is missing is dropped with a note naming its file", (t) => {
  const s = scratch(t);
  s.manifest(frontmatter("captured") + CAPTURED);
  s.png("02-login-error.png");
  const run = s.run();
  assert.equal(run.status, 0, run.stderr);
  const file = JSON.parse(readFileSync(s.entriesFile, "utf8"));
  assert.deepEqual(file.entries.map((e) => e.caption), ["The error state."]);
  assert.deepEqual(file.notes, ["01-login-populated.png is listed in the manifest but missing from disk"]);
});

test("a partial manifest adds a note counting the skipped states", (t) => {
  const s = scratch(t);
  s.manifest(`${frontmatter("partial")}## Captured\n${entry("01-a.png", "empty", "Empty list.")}\n## Skipped\n\n- /admin: skipped-auth\n- /settings: timeout\n- 3 more states not captured\n`);
  s.png("01-a.png");
  const run = s.run();
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout).notes, ["5 states skipped — see manifest"]);
});

test("a rerun replaces the entries file", (t) => {
  const s = scratch(t);
  s.manifest(frontmatter("captured") + CAPTURED);
  s.png("01-login-populated.png");
  s.png("02-login-error.png");
  writeFileSync(s.entriesFile, "stale");
  assert.equal(s.run().status, 0);
  const first = readFileSync(s.entriesFile, "utf8");
  assert.equal(s.run().status, 0);
  assert.equal(readFileSync(s.entriesFile, "utf8"), first);
});

test("each capture gap exits 1 with its reason and writes nothing", (t) => {
  const cases = [
    [null, "absent"],
    [frontmatter("skipped-no-tool"), "skipped: skipped-no-tool"],
    [frontmatter("skipped-server-start") + CAPTURED, "skipped: skipped-server-start"],
    [frontmatter("captured") + CAPTURED, "pngs-missing"],
    [`${frontmatter("captured")}## Captured\n\n## Skipped\n`, "no-captured-entries"],
    ["status: captured\n", "malformed: no frontmatter"],
    ["---\nstatus: captured\n", "malformed: unterminated frontmatter"],
    ["---\ntopic: demo\n---\n## Captured\n", "malformed: no status"],
    [frontmatter("done") + CAPTURED, "malformed: unknown status done"],
    [frontmatter("captured"), "malformed: no ## Captured section"],
    [`${frontmatter("captured")}## Captured\n${entry("../escape.png", "error", "Out.")}`, 'malformed: entry heading "../escape.png" is not a PNG file name'],
    [`${frontmatter("captured")}## Captured\n${entry("01-a.jpg", "error", "Jpeg.")}`, 'malformed: entry heading "01-a.jpg" is not a PNG file name'],
    [`${frontmatter("captured")}## Captured\n\n### 01-a.png\n\n- state: error\n`, "malformed: entry 01-a.png has no caption"],
  ];
  for (const [text, reason] of cases) {
    const s = scratch(t);
    if (text !== null) s.manifest(text);
    assert.deepEqual(gap(s.run()), { decision: "capture-gap", reason }, reason);
    assert.equal(existsSync(s.entriesFile), false, reason);
  }
});

test("usage faults exit 2", (t) => {
  const s = scratch(t);
  for (const args of [[], ["only-one"], ["a", "b", "c"], ["--help", "x"]]) {
    const run = s.run(args);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /usage: manifest-entries\.mjs <artifact-dir> <entries-file>/);
  }
});

test("an entries file in a missing directory exits 2", (t) => {
  const s = scratch(t);
  s.manifest(frontmatter("captured") + CAPTURED);
  s.png("01-login-populated.png");
  const run = s.run([join(s.shots, ".."), join(s.shots, "no-such-dir", "entries.json")]);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /no directory for the entries file/);
});
