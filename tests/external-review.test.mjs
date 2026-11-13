// Runs skills/team/references/external-review.mjs against stubbed `codex` and `agy` binaries.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { AGY_PROMPT_CAP_BYTES, PROMPT_CAP_BYTES, TIMEOUT_MS } from "../skills/team/references/external-review.mjs";

const SCRIPT = resolve("skills/team/references/external-review.mjs");

const CLAUDE_CODE_FOREGROUND_BASH_MAX_MS = 600_000;

function workspace(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "external-review-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  for (const cli of ["codex", "agy"]) {
    const path = join(bin, cli);
    writeFileSync(path, `#!/bin/sh\ntouch "${root}/${cli}-ran"\necho "${cli} review"\n`);
    chmodSync(path, 0o755);
  }
  return { root, bin };
}

function runReview({ root, bin }, cli, prompt) {
  return spawnSync(process.execPath, [SCRIPT, "run", cli, root], {
    input: prompt,
    encoding: "utf8",
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: root },
  });
}

test("the runner's timeout leaves room to print its skip inside the host's foreground Bash maximum", () => {
  assert.ok(TIMEOUT_MS < CLAUDE_CODE_FOREGROUND_BASH_MAX_MS);
});

test("agy over its prompt cap prints one skip line and never starts agy", (t) => {
  const space = workspace(t);
  const prompt = "x".repeat(AGY_PROMPT_CAP_BYTES + 1);
  const result = runReview(space, "agy", prompt);
  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    `skip: agy prompt is ${AGY_PROMPT_CAP_BYTES + 1} bytes, over the ${AGY_PROMPT_CAP_BYTES}-byte agy cap\n`,
  );
  assert.equal(existsSync(join(space.root, "agy-ran")), false);
});

test("agy at its prompt cap runs", (t) => {
  const space = workspace(t);
  const result = runReview(space, "agy", "x".repeat(AGY_PROMPT_CAP_BYTES));
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "agy review\n");
});

test("codex over the agy cap still runs", (t) => {
  assert.ok(AGY_PROMPT_CAP_BYTES < PROMPT_CAP_BYTES);
  const space = workspace(t);
  const result = runReview(space, "codex", "x".repeat(AGY_PROMPT_CAP_BYTES + 1));
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "codex review\n");
});
