// Fails when a skill script's CLI entry guard skips the CLI for a script run through a
// symlinked directory (as under macOS /tmp → /private/tmp), or runs it on import.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const IMPORTER = 'import { pathToFileURL } from "node:url";\nawait import(pathToFileURL(process.argv[2]).href);\n';

function scratchDir(t) {
  const root = mkdtempSync(join(tmpdir(), "entry-guard-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function symlinkedDir(t, target) {
  const link = join(scratchDir(t), "link");
  symlinkSync(resolve(target), link);
  return link;
}

function runScript(path) {
  return spawnSync(process.execPath, [path], { encoding: "utf8" });
}

function importModule(t, path) {
  const importer = join(scratchDir(t), "importer.mjs");
  writeFileSync(importer, IMPORTER);
  const run = spawnSync(process.execPath, [importer, path], { encoding: "utf8" });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

// [script, directory, exit code its CLI returns when run with no arguments]
const ENTRY_POINTS = [
  ["supports-nesting.mjs", "skills/team/references", 1],
  ["resolve-model.mjs", "skills/team/references", 1],
  ["external-review.mjs", "skills/team/references", 2],
  ["review-comments.mjs", "skills/team-pr/scripts", 2],
  ["manifest-entries.mjs", "skills/team-pr/scripts", 2],
  ["render-research.mjs", "skills/team/scripts", 2],
  ["record-design-review.mjs", "skills/team/scripts", 2],
  ["append-cross-model-notes.mjs", "skills/team/scripts", 2],
  ["change-profile.mjs", "skills/team-code-review/scripts", 2],
];

test("each entry point runs its CLI through a symlinked directory and not on import", async (t) => {
  for (const [script, dir, status] of ENTRY_POINTS) {
    await t.test(script, (t) => {
      const path = join(symlinkedDir(t, dir), script);
      assert.equal(runScript(path).status, status, "CLI did not run");
      assert.deepEqual(importModule(t, path), { status: 0, stdout: "", stderr: "" }, "import had side effects");
    });
  }
});
