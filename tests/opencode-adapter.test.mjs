// Runs the OpenCode 2.x plugin definition in opencode/team.js against a fake
// plugin context and this checkout's own skill catalog.
import assert from "node:assert/strict";
import { basename, resolve } from "node:path";
import test from "node:test";

import { loadCatalog } from "../opencode/catalog.mjs";
import plugin from "../opencode/team.js";

const ROOT = resolve(".");
const CATALOG = loadCatalog(ROOT);

async function setup({ commands = [], skills = [] } = {}) {
  const added = { commands: [], skills: [...skills], prompts: [] };
  await plugin.setup({
    command: {
      list: async () => ({ data: commands }),
      transform: async (callback) => callback({ add: (definition) => added.commands.push(definition) }),
    },
    skill: {
      transform: async (callback) => callback({
        get: (id) => added.skills.find((skill) => skill.id === id),
        add: (skill) => added.skills.push(skill),
      }),
    },
    session: { prompt: async (input) => { added.prompts.push(input); } },
  });
  return added;
}

test("default export is an OpenCode 2.x definition", () => {
  assert.equal(plugin.id, "team");
  assert.equal(typeof plugin.setup, "function");
});

test("every catalog skill becomes a command with its description", async () => {
  const { commands } = await setup();
  assert.deepEqual(
    commands.map(({ name, description }) => ({ name, description })),
    CATALOG.map(({ name, description }) => ({ name, description })),
  );
});

test("a command prompts its session with the skill pointer and the literal arguments", async () => {
  const { commands, prompts } = await setup();
  const skill = CATALOG.find((entry) => entry.name === "team-question");
  const files = [{ uri: "file:///tmp/spec.md" }];
  const text = "add a flag $1 !`printf example`";
  await commands.find((command) => command.name === skill.name)
    .execute({ sessionID: "ses_1", prompt: { text, files }, delivery: "queue" });
  assert.equal(prompts.length, 1);
  const [sent] = prompts;
  assert.equal(sent.sessionID, "ses_1");
  assert.equal(sent.delivery, "queue");
  assert.deepEqual(sent.files, files);
  const lines = sent.text.split("\n");
  assert.equal(lines[0], "The user explicitly invoked /team-question.");
  assert.ok(lines[1].includes(JSON.stringify(skill.file)));
  assert.ok(lines[2].includes(JSON.stringify(skill.base)));
  assert.ok(lines[3].includes(JSON.stringify(ROOT)));
  assert.equal(lines.at(-1), text);
});

test("only unguarded skills are added as skills, with the body as content", async () => {
  const { skills } = await setup();
  const unguarded = CATALOG.filter((skill) => !skill.guarded);
  assert.ok(unguarded.length < CATALOG.length, "the catalog has a guarded skill");
  assert.deepEqual(skills.map((skill) => skill.id), unguarded.map((skill) => basename(skill.base)));
  for (const [index, skill] of skills.entries()) {
    assert.equal(skill.name, unguarded[index].name);
    assert.equal(skill.description, unguarded[index].description);
    assert.equal(skill.path, unguarded[index].file);
    assert.ok(skill.content.trim().length > 0);
    assert.ok(!skill.content.startsWith("---"));
  }
});

test("a skill already registered under the same id is kept", async () => {
  const existing = { id: "team-question", name: "team-question", path: "/elsewhere/SKILL.md", content: "other" };
  const { skills } = await setup({ skills: [existing] });
  assert.deepEqual(skills.filter((skill) => skill.id === "team-question"), [existing]);
});

test("an existing command with a Team name rejects the whole contribution", async () => {
  const added = { commands: 0, skills: 0 };
  await assert.rejects(
    plugin.setup({
      command: { list: async () => ({ data: [{ name: "team-question" }] }), transform: async () => { added.commands += 1; } },
      skill: { transform: async () => { added.skills += 1; } },
    }),
    /Team OpenCode command collision: team-question/,
  );
  assert.deepEqual(added, { commands: 0, skills: 0 });
});
