// Fails when check-links.mjs passes a plugin tree whose Markdown references do not
// resolve from the file that contains them, or fails a tree whose references do.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = ".claude/scripts/check-links.mjs";

function pluginTree(t, files) {
  const root = mkdtempSync(join(tmpdir(), "check-links-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function check(root) {
  return spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8" });
}

const SHIPPED = {
  "agents/planner.md": "# Planner\n",
  "skills/team/SKILL.md": "Read [testing](references/testing.md).\n",
  "skills/team/references/testing.md": "# Testing\n",
  "skills/team/principles/focused-work.md": "# Focused work\n",
  "skills/team/scripts/status.sh": "#!/bin/sh\n",
};

test("a playbook link written from the skill directory fails with file and line", (t) => {
  const root = pluginTree(t, {
    ...SHIPPED,
    "skills/team/playbooks/implement.md": "# Implement\n\nRead the [testing rules](references/testing.md#authoring-gate).\n",
  });
  const run = check(root);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /^FAIL skills\/team\/playbooks\/implement\.md:3: link references\/testing\.md#authoring-gate does not resolve$/m);
});

test("file-relative links, fragments, wrapped link text, and external links pass", (t) => {
  const root = pluginTree(t, {
    ...SHIPPED,
    "skills/team/playbooks/implement.md": [
      "Read the [testing rules](../references/testing.md#authoring-gate) and the",
      "[focused work",
      "rules](../principles/focused-work.md). See [docs](https://example.com/x.md),",
      "[this section](#core-rule), and dispatch [`planner`](../../../agents/planner.md).",
      "",
    ].join("\n"),
  });
  const run = check(root);
  assert.equal(run.stderr, "");
  assert.equal(run.stdout, "");
  assert.equal(run.status, 0);
});

test("a wrapped link whose target is missing fails", (t) => {
  const root = pluginTree(t, {
    ...SHIPPED,
    "skills/team/references/design-reviewer.md": "Read the [design\ntemplate](references/design-template.md).\n",
  });
  const run = check(root);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /design-reviewer\.md:2: link references\/design-template\.md does not resolve/);
});

test("a backticked shipped path resolves from the file, inside or outside a fence", (t) => {
  const root = pluginTree(t, {
    ...SHIPPED,
    "skills/team/references/loop.md": [
      "Run `../scripts/status.sh`, then `scripts/status.sh`.",
      "```",
      "  4. Dispatch per `references/testing.md`.",
      "```",
      "",
    ].join("\n"),
  });
  const run = check(root);
  assert.equal(run.status, 1);
  assert.doesNotMatch(run.stdout, /\.\.\/scripts\/status\.sh/);
  assert.match(run.stdout, /loop\.md:1: code scripts\/status\.sh does not resolve/);
  assert.match(run.stdout, /loop\.md:3: code references\/testing\.md does not resolve/);
});

test("a backticked skills/ or agents/ path resolves from the plugin root", (t) => {
  const root = pluginTree(t, {
    ...SHIPPED,
    "skills/team/references/dispatch.md": "Read `agents/planner.md` and `skills/team/agents/planner.md`.\n",
  });
  const run = check(root);
  assert.equal(run.status, 1);
  assert.doesNotMatch(run.stdout, /code agents\/planner\.md/);
  assert.match(run.stdout, /dispatch\.md:1: code skills\/team\/agents\/planner\.md does not resolve/);
});

test("run-time artifacts, placeholders, and links inside fences are not checked", (t) => {
  const root = pluginTree(t, {
    ...SHIPPED,
    "skills/team/SKILL.md": [
      "Write `1-task.md` and `docs/plans/<id>/6-design.md`; dispatch `agents/<name>.md`.",
      "```markdown",
      "See [example](references/missing.md).",
      "```",
      "",
    ].join("\n"),
  });
  const run = check(root);
  assert.equal(run.stdout, "");
  assert.equal(run.status, 0);
});

test("an unknown argument is a usage error", () => {
  const run = spawnSync(process.execPath, [SCRIPT, "--bogus"], { encoding: "utf8" });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^check-links\.mjs: usage: /);
});
