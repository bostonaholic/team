import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function objectField(value, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Team OpenCode config: ${field} must be an object.`);
  }
}

function command(skill) {
  return {
    description: skill.description + (skill.name === "reflect" ? " OpenCode session reflection is unsupported." : ""),
    template: [
      `The user explicitly invoked /${skill.name}.`,
      `Read the canonical skill file ${JSON.stringify(skill.file)} using the filesystem read tool, then follow its instructions.`,
      `Resolve relative references and scripts against the skill base directory ${JSON.stringify(skill.base)}.`,
      "Use the following user arguments for the skill's argument references:",
      "$ARGUMENTS",
    ].join("\n"),
  };
}

export default async function TeamPlugin() {
  const entry = realpathSync(fileURLToPath(import.meta.url));
  const root = dirname(dirname(entry));
  const { loadCatalog } = await import(pathToFileURL(join(root, "opencode/catalog.mjs")).href);
  const catalog = loadCatalog(root);
  return {
    async config(config) {
      objectField(config, "config");
      if (config.skills !== undefined) objectField(config.skills, "skills");
      const paths = config.skills?.paths;
      if (paths !== undefined && (!Array.isArray(paths) || paths.some((path) => typeof path !== "string"))) {
        throw new Error("Team OpenCode config: skills.paths must be an array of strings.");
      }
      if (config.command !== undefined) objectField(config.command, "command");
      for (const skill of catalog) {
        if (Object.hasOwn(config.command ?? {}, skill.name)) {
          throw new Error(`Team OpenCode command collision: ${skill.name}. Rename or remove the existing command before loading Team.`);
        }
      }
      const commands = Object.fromEntries(catalog.map((skill) => [skill.name, command(skill)]));
      const mergedPaths = [...new Set([...(paths ?? []), ...catalog.filter((skill) => !skill.guarded).map((skill) => skill.base)])];
      config.skills = { ...config.skills, paths: mergedPaths };
      config.command = { ...config.command, ...commands };
    },
  };
}
