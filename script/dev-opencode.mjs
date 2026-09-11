import { lstatSync, mkdirSync, readlinkSync, realpathSync, rmdirSync, statSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function optionalStat(path, stat) {
  try { return stat(path); }
  catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

function changeRegistration(operation, target, source) {
  const existing = optionalStat(target, lstatSync);
  if (existing && (!existing.isSymbolicLink() || readlinkSync(target) !== source)) {
    throw new Error(`Refusing to change ${target}: it is not owned by this checkout (${source}). Uninstall from the owning checkout or relocate the conflicting target yourself.`);
  }
  if (operation === "install") {
    if (!existing) symlinkSync(source, target);
    console.log(`Registered Team: ${target} → ${source}\nRestart OpenCode to read the live checkout. Registration does not validate native configuration or prove plugin loading.`);
  } else {
    if (existing) unlinkSync(target);
    console.log(`${existing ? "Removed" : "Already absent"}: ${target}\nRestart OpenCode to refresh its plugins.`);
  }
}

async function main() {
  const operation = process.argv[2];
  if (operation !== "install" && operation !== "uninstall") throw new Error("Usage: dev-opencode.mjs install|uninstall");
  const checkout = dirname(dirname(realpathSync(fileURLToPath(import.meta.url))));
  const source = join(checkout, "opencode/team.js");
  if (operation === "install") {
    const { loadCatalog } = await import(pathToFileURL(join(checkout, "opencode/catalog.mjs")).href);
    loadCatalog(checkout);
  }
  const config = process.env.OPENCODE_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(process.env.HOME, ".config"), "opencode");
  const parent = resolve(config, "plugins");
  if (operation === "install") mkdirSync(parent, { recursive: true });
  const parentStat = optionalStat(parent, statSync);
  if (!parentStat) {
    console.log(`Already absent: ${join(parent, "team.js")}`);
    return;
  }
  if (!parentStat.isDirectory()) throw new Error(`Expected a plugin directory: ${parent}`);
  const target = join(realpathSync(parent), "team.js");
  const lock = `${target}.lock`;
  try { mkdirSync(lock); }
  catch (error) {
    if (error.code === "EEXIST") {
      throw new Error(`Team lifecycle busy: ${lock}. After confirming no install/uninstall process remains, remove this stale lock directory manually and rerun.`);
    }
    throw error;
  }
  try { changeRegistration(operation, target, source); }
  finally { rmdirSync(lock); }
}

main().catch((error) => {
  console.error(`Error: ${error.message}${error.code === "ERR_MODULE_NOT_FOUND" ? ". Restore the required checkout runtime files and rerun." : ""}`);
  process.exitCode = 1;
});
