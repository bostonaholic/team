import { realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function prompt(skill, root, userArguments) {
  return [
    `The user explicitly invoked /${skill.name}.`,
    `Read the canonical skill file ${JSON.stringify(skill.file)} using the filesystem read tool, then follow its instructions.`,
    `Resolve relative references and scripts against the skill base directory ${JSON.stringify(skill.base)}.`,
    `The installed plugin root is ${JSON.stringify(root)}. Supply resolved installed agent definitions and applicable resource paths before dispatch.`,
    "If an installed resource is missing, stop its consuming step and report the resolved path. Never fall back to a source checkout or recursively load references.",
    "Use the following user arguments for the skill's argument references:",
    userArguments,
  ].join("\n");
}

export default {
  id: "team",
  async setup(ctx) {
    const entry = realpathSync(fileURLToPath(import.meta.url));
    const root = dirname(dirname(entry));
    const { loadCatalog } = await import(pathToFileURL(join(root, "opencode/catalog.mjs")).href);
    const catalog = loadCatalog(root);
    const existing = new Set((await ctx.command.list()).data.map((command) => command.name));
    for (const skill of catalog) {
      if (existing.has(skill.name)) {
        throw new Error(`Team OpenCode command collision: ${skill.name}. Rename or remove the existing command before loading Team.`);
      }
    }
    await ctx.command.transform((editor) => {
      for (const skill of catalog) {
        editor.add({
          name: skill.name,
          description: skill.description,
          execute: async (input) => {
            await ctx.session.prompt({
              ...input.prompt,
              sessionID: input.sessionID,
              text: prompt(skill, root, input.prompt.text),
              delivery: input.delivery,
            });
          },
        });
      }
    });
    await ctx.skill.transform((editor) => {
      for (const skill of catalog) {
        const id = basename(skill.base);
        if (skill.guarded || editor.get(id)) continue;
        editor.add({ id, name: skill.name, description: skill.description, path: skill.file, content: skill.content });
      }
    });
  },
};
