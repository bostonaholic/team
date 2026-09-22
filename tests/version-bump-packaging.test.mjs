import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import test from "node:test";

const productName = ["Te", "am"].join("");
const hardcodedOwnerRepo = ["bostonaholic", "team"].join("/");

test("version-bump is packaged as a shared skill for every plugin host", () => {
  assert.ok(existsSync("skills/version-bump/SKILL.md"));
  assert.ok(existsSync("skills/version-bump/agents/openai.yaml"));

  const versionBumpSkill = readFileSync("skills/version-bump/SKILL.md", "utf8");
  const versionBumpOpenAi = readFileSync("skills/version-bump/agents/openai.yaml", "utf8");

  assert.match(versionBumpSkill, /^name: version-bump$/m);
  assert.match(versionBumpSkill, /ship it/);
  assert.doesNotMatch(versionBumpSkill, /\.claude\/skills\/version-bump/);
  assert.doesNotMatch(versionBumpSkill, new RegExp(`${productName} plugin|${productName} PR|${productName}-internal|${hardcodedOwnerRepo}`));
  assert.doesNotMatch(versionBumpOpenAi, new RegExp(`${productName} plugin|${productName} pull request`));
});

test("shipit uses version-bump without repository-specific versioning", () => {
  const shipitSkill = readFileSync("skills/shipit/SKILL.md", "utf8");
  const shipitLandSequence = readFileSync("skills/shipit/references/02-land-sequence.md", "utf8");

  assert.match(shipitSkill, /invokes `version-bump`/);
  assert.match(shipitLandSequence, /Run the `version-bump` skill before pushing/);
  assert.match(shipitLandSequence, /`shipit` does not inspect changed files or edit version files itself/);
  assert.doesNotMatch(shipitSkill, new RegExp(hardcodedOwnerRepo));
  assert.doesNotMatch(shipitLandSequence, new RegExp(hardcodedOwnerRepo));
});
