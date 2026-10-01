import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

test("Team ships no versioning skill; this repo keeps its own project-local", () => {
  assert.ok(!existsSync("skills/version-bump"));
  assert.ok(existsSync(".claude/skills/version-bump/SKILL.md"));
});
