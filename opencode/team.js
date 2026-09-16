import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Spawn a canonical recovery hook with the user's project as cwd. The hooks
// write their JSON envelope to stderr and always exit 0; a crash, timeout, or
// empty payload means no context. Never throw into the host.
function recoveryContext(root, script, projectRoot) {
  try {
    const result = spawnSync("node", [join(root, script)], {
      cwd: projectRoot,
      input: JSON.stringify({ cwd: projectRoot }),
      encoding: "utf-8",
      timeout: 5000,
    });
    if (result.status !== 0 || typeof result.stderr !== "string" || result.stderr.length === 0) return null;
    const context = JSON.parse(result.stderr)?.hookSpecificOutput?.additionalContext;
    return typeof context === "string" && context.length > 0 ? context : null;
  } catch {
    return null;
  }
}

function objectField(value, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Team OpenCode config: ${field} must be an object.`);
  }
}

function command(skill, root) {
  return {
    description: skill.description,
    template: [
      `The user explicitly invoked /${skill.name}.`,
      `Read the canonical skill file ${JSON.stringify(skill.file)} using the filesystem read tool, then follow its instructions.`,
      `Resolve relative references and scripts against the skill base directory ${JSON.stringify(skill.base)}.`,
      `The installed plugin root is ${JSON.stringify(root)}. Supply resolved installed agent definitions and applicable resource paths before dispatch.`,
      "If an installed resource is missing, stop its consuming step and report the resolved path. Never fall back to a source checkout or recursively load references.",
      "Use the following user arguments for the skill's argument references:",
      "$ARGUMENTS",
    ].join("\n"),
  };
}

export default async function TeamPlugin(input) {
  const entry = realpathSync(fileURLToPath(import.meta.url));
  const root = dirname(dirname(entry));
  const projectRoot = input?.directory ?? process.cwd();
  const { loadCatalog } = await import(pathToFileURL(join(root, "opencode/catalog.mjs")).href);
  const catalog = loadCatalog(root);
  const { validatePluginFile } = await import(pathToFileURL(join(root, "hooks/lib/validate-plugin-file.mjs")).href);
  // The host rebuilds `output.system` on every call, so the recovered string is
  // cached per session and re-appended rather than re-scanned.
  const recovered = new Map();
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
      const commands = Object.fromEntries(catalog.map((skill) => [skill.name, command(skill, root)]));
      const mergedPaths = [...new Set([...(paths ?? []), ...catalog.filter((skill) => !skill.guarded).map((skill) => skill.base)])];
      config.skills = { ...config.skills, paths: mergedPaths };
      config.command = { ...config.command, ...commands };
    },
    async "experimental.chat.system.transform"(input, output) {
      if (!Array.isArray(output?.system)) return;
      const session = input?.sessionID;
      if (!recovered.has(session)) {
        recovered.set(session, recoveryContext(root, "hooks/session-start-recover.mjs", projectRoot));
      }
      const context = recovered.get(session);
      if (typeof context === "string") output.system.push(context);
    },
    async "experimental.session.compacting"(input, output) {
      if (!Array.isArray(output?.context)) return;
      const context = recoveryContext(root, "hooks/pre-compact-anchor.mjs", projectRoot);
      if (typeof context === "string") output.context.push(context);
    },
    async "tool.execute.after"(input) {
      if (input?.tool !== "write" && input?.tool !== "edit") return;
      const writtenPath = input?.args?.filePath;
      if (typeof writtenPath !== "string") return;
      const absolutePath = resolve(projectRoot, writtenPath);
      const relativePath = relative(projectRoot, absolutePath);
      if (relativePath.startsWith("..")) return;
      let reasons;
      try {
        reasons = await validatePluginFile(relativePath, absolutePath);
      } catch {
        return;
      }
      if (reasons.length > 0) {
        throw new Error(`BLOCKED: Plugin file validation failed for ${relativePath}: ${reasons.join("; ")}. Fix the issue before proceeding.`);
      }
    },
  };
}
