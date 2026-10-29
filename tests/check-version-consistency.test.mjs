// Runs .claude/scripts/check-version-consistency.sh against synthetic manifest trees.
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = resolve(".claude/scripts/check-version-consistency.sh");
const DESCRIPTION = "Orchestrates agents in a scratch tree";

function writeJson(dir, rel, value) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), JSON.stringify(value, null, 2));
}

// The six files the script reads, holding only the fields it reads, all at version 1.2.3.
function manifestTree(t) {
  const dir = mkdtempSync(join(tmpdir(), "check-version-consistency-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeJson(dir, ".claude-plugin/plugin.json", { name: "team", version: "1.2.3", description: DESCRIPTION });
  writeJson(dir, ".claude-plugin/marketplace.json", {
    name: "team-dev",
    metadata: { version: "1.2.3", description: DESCRIPTION },
    plugins: [{ name: "team", version: "1.2.3", description: DESCRIPTION }],
  });
  writeJson(dir, ".codex-plugin/plugin.json", { name: "team", version: "1.2.3", description: DESCRIPTION });
  writeJson(dir, ".agents/plugins/marketplace.json", { name: "team-dev", plugins: [{ name: "team", description: DESCRIPTION }] });
  writeJson(dir, "plugin.json", { name: "team", version: "1.2.3", description: DESCRIPTION });
  writeJson(dir, "package.json", { version: "1.2.3", description: DESCRIPTION });
  mkdirSync(join(dir, ".claude/scripts"), { recursive: true });
  copyFileSync(SCRIPT, join(dir, ".claude/scripts/check-version-consistency.sh"));
  return dir;
}

const runScript = (dir) => spawnSync("bash", [join(dir, ".claude/scripts/check-version-consistency.sh")], { encoding: "utf8" });

test("check-version-consistency passes a consistent manifest tree", (t) => {
  const run = runScript(manifestTree(t));
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^OK: six version strings agree on 1\.2\.3; /);
});

const DRIFTS = [
  {
    row: "root plugin.json name",
    file: "plugin.json",
    json: { name: "team-next", version: "1.2.3", description: DESCRIPTION },
    line: /^FAIL plugin\.json name differs from \.claude-plugin\/plugin\.json$/m,
  },
  {
    row: "root plugin.json description",
    file: "plugin.json",
    json: { name: "team", version: "1.2.3", description: "A different description" },
    line: /^FAIL plugin\.json \.description description differs from \.claude-plugin\/plugin\.json$/m,
  },
  {
    row: ".codex-plugin/plugin.json version",
    file: ".codex-plugin/plugin.json",
    json: { name: "team", version: "1.2.4", description: DESCRIPTION },
    line: /^FAIL \.codex-plugin\/plugin\.json \.version is '1\.2\.4', expected '1\.2\.3'$/m,
  },
];

for (const { row, file, json, line } of DRIFTS) {
  test(`check-version-consistency fails and names each manifest drift: ${row}`, (t) => {
    const dir = manifestTree(t);
    writeJson(dir, file, json);
    const run = runScript(dir);
    assert.equal(run.status, 1, run.stdout);
    assert.match(run.stderr, line);
    assert.match(run.stderr, /^1 inconsistency\(ies\) found$/m);
  });
}
