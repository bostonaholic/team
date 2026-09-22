import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

function frontmatterValue(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  assert.ok(match, `missing ${key}`);

  const value = match[1].trim();
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value);
  }
  return value;
}

const runtimeSkillPaths = readdirSync("skills", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `skills/${entry.name}/SKILL.md`)
  .filter(existsSync);
const localSkillPaths = readdirSync(".claude/skills", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `.claude/skills/${entry.name}/SKILL.md`)
  .filter(existsSync);

test("skill descriptions put bounded use conditions first", () => {
  for (const skillPath of [...runtimeSkillPaths, ...localSkillPaths]) {
    const source = readFileSync(skillPath, "utf8");
    const name = frontmatterValue(source, "name");
    const description = frontmatterValue(source, "description");
    const limit = /^user-invocable:\s*false$/m.test(source) ? 150 : 200;
    const sentences = description.split(". ");

    assert.match(description, /^Use (?:only )?for /, skillPath);
    assert.ok(!description.includes(`/${name}`), `${skillPath} repeats its slash command`);
    assert.ok(description.length <= limit, `${skillPath} description exceeds ${limit} characters`);
    if (sentences.length > 1) {
      assert.doesNotMatch(sentences.at(-1), /^(?:Use|Never)\b/, `${skillPath} must put its capability last`);
    }
  }
});

test("each runtime skill has host metadata", () => {
  for (const skillPath of runtimeSkillPaths) {
    const manifestPath = skillPath.replace("SKILL.md", "agents/openai.yaml");
    assert.ok(existsSync(manifestPath), `missing ${manifestPath}`);

    const manifest = readFileSync(manifestPath, "utf8");
    assert.match(manifest, /^\s*short_description:\s*".+"$/m, manifestPath);
    assert.match(manifest, /^\s*default_prompt:\s*".+"$/m, manifestPath);
  }
});
