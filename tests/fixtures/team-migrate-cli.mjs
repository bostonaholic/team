// Stateful stand-ins for claude, codex, agy, and ps, used by
// tests/team-migrate.test.mjs. Each stub in the scratch bin/ runs
// `node team-migrate-cli.mjs <tool> <args...>`.
//
//   FAKE_STATE  JSON file holding both hosts' marketplaces and plugins
//   FAKE_TREES  directory of <owner>/<repo> source trees a GitHub source maps to
//   FAKE_LOG    every call is appended here, one line each
//   FAKE_PS     lines `ps -axo pid=,comm=` prints
// A call whose words equal the state's `failOn` fails, to stop a run midway.
import { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const [tool, ...args] = process.argv.slice(2);
const HOME = process.env.HOME;
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(HOME, ".claude");
const CODEX_DIR = process.env.CODEX_HOME || join(HOME, ".codex");

appendFileSync(process.env.FAKE_LOG, `${[tool, ...args].join(" ")}\n`);
const state = JSON.parse(readFileSync(process.env.FAKE_STATE, "utf8"));
const save = () => writeFileSync(process.env.FAKE_STATE, `${JSON.stringify(state, null, 2)}\n`);
const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
if (state.failOn === [tool, ...args].join(" ")) fail(`injected failure: ${state.failOn}`);
const lexists = (path) => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

// A marketplace entry's tree: a directory source is its path, a GitHub one maps into FAKE_TREES.
const treeOf = (market) => (market.path ? market.path : join(process.env.FAKE_TREES, market.repo));
const manifest = (tree, file) => readJson(join(tree, ".claude-plugin", file));
function skillDirs(tree) {
  const found = [];
  const walk = (dir, depth) => {
    if (!existsSync(dir) || depth > 3) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(dir, entry.name);
      if (existsSync(join(path, "SKILL.md"))) found.push(path);
      else walk(path, depth + 1);
    }
  };
  walk(join(tree, "skills"), 0);
  return found;
}
const bareSkills = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((name) => !name.startsWith(".") && existsSync(join(dir, name, "SKILL.md"))) : [];

function sourceOf(arg, host) {
  if (arg.startsWith("/")) {
    if (!existsSync(join(arg, ".claude-plugin", "marketplace.json"))) fail(`no marketplace at ${arg}`);
    return host === "claude" ? { source: "directory", path: arg } : { sourceType: "local", source: arg, root: arg, path: arg };
  }
  const tree = join(process.env.FAKE_TREES, arg);
  if (!existsSync(tree)) fail(`cannot clone ${arg}`);
  return host === "claude"
    ? { source: "github", repo: arg }
    : { sourceType: "git", source: `https://github.com/${arg}.git`, repo: arg };
}

function host(name) {
  const side = state[name];
  const marketOf = (id) => side.markets[id.split("@")[1]] ?? fail(`unknown marketplace for ${id}`);
  const installed = (id) => side.plugins.find((plugin) => plugin.id === id);
  return {
    addMarket(arg) {
      const source = sourceOf(arg, name);
      const market = manifest(treeOf(source), "marketplace.json").name;
      if (name === "codex" && source.repo) source.root = join(CODEX_DIR, ".tmp", "marketplaces", market);
      side.markets[market] = source;
      console.log(`Added marketplace ${market}`);
    },
    removeMarket(market) {
      if (!side.markets[market]) fail(`marketplace ${market} not found`);
      delete side.markets[market];
      console.log(`Removed marketplace ${market}`);
    },
    install(id) {
      const tree = treeOf(marketOf(id));
      if (!existsSync(tree)) fail(`marketplace source missing for ${id}`);
      const version = manifest(tree, "plugin.json").version;
      const plugin = installed(id);
      if (plugin) plugin.version = version;
      else side.plugins.push({ id, version });
      console.log(`Installed ${id}@${version}`);
    },
    uninstall(id) {
      if (!installed(id)) fail(`${id} is not installed`);
      side.plugins = side.plugins.filter((plugin) => plugin.id !== id);
      console.log(`Uninstalled ${id}`);
    },
    // Every skill the host loads: each loadable plugin's, prefixed, then bare copies.
    skills(bareDirs) {
      const loaded = side.plugins.filter((plugin) => {
        const market = side.markets[plugin.id.split("@")[1]];
        return market && existsSync(treeOf(market));
      });
      return {
        loaded,
        names: [
          ...loaded.flatMap((plugin) =>
            skillDirs(treeOf(side.markets[plugin.id.split("@")[1]])).map((dir) => `${plugin.id.split("@")[0]}:${basename(dir)}`),
          ),
          ...bareDirs.flatMap(bareSkills),
        ],
      };
    },
  };
}

function claude() {
  const claudeHost = host("claude");
  const command = args.filter((arg) => !arg.startsWith("--") && !["user"].includes(arg)).join(" ");
  if (args[0] === "-p") {
    const { loaded, names } = claudeHost.skills([join(CLAUDE_DIR, "skills")]);
    const plugins = loaded.map((plugin) => ({ name: plugin.id.split("@")[0], source: plugin.id }));
    console.log(JSON.stringify({ type: "system", subtype: "init", skills: names, plugins }));
    console.log(JSON.stringify({ type: "result", subtype: "success", result: "OK" }));
    return;
  }
  const [, verb, ...rest] = command.split(" ");
  if (command === "plugin marketplace list") {
    console.log(JSON.stringify(Object.entries(state.claude.markets).map(([name, market]) => ({ name, ...market }))));
  } else if (command === "plugin list") {
    console.log(JSON.stringify(state.claude.plugins.map((plugin) => ({ scope: "user", ...plugin, enabled: true }))));
  } else if (verb === "marketplace") {
    const [action, target] = rest;
    if (action === "add") claudeHost.addMarket(target);
    else if (action === "remove") claudeHost.removeMarket(target);
    else if (action === "update") state.claude.markets[target] ?? fail(`marketplace ${target} not found`);
    else fail(`unexpected: claude ${args.join(" ")}`);
  } else if (verb === "install" || verb === "update") claudeHost.install(rest[0]);
  else if (verb === "uninstall") claudeHost.uninstall(rest[0]);
  else fail(`unexpected: claude ${args.join(" ")}`);
  save();
}

function codex() {
  const codexHost = host("codex");
  const command = args.filter((arg) => !arg.startsWith("--")).join(" ");
  if (command === "plugin marketplace list") {
    const missing = Object.entries(state.codex.markets).find(([, market]) => market.root && market.sourceType === "local" && !existsSync(market.root));
    if (missing) fail(`marketplace ${missing[0]} root ${missing[1].root} has no manifest`);
    const marketplaces = Object.entries(state.codex.markets).map(([name, market]) => ({
      name,
      root: market.root,
      marketplaceSource: { sourceType: market.sourceType, source: market.source },
    }));
    console.log(JSON.stringify({ marketplaces }));
  } else if (command === "plugin list") {
    const installed = state.codex.plugins.map((plugin) => ({ pluginId: plugin.id, version: plugin.version, installed: true }));
    console.log(JSON.stringify({ installed, available: [] }));
  } else if (args[0] === "debug" && args[1] === "prompt-input") {
    const { names } = codexHost.skills([join(HOME, ".agents", "skills"), join(CODEX_DIR, "skills")]);
    const text = ["<skills_instructions>", ...names.map((skill, n) => `- ${skill}: A skill. (file: r${n}/SKILL.md)`)].join("\n");
    console.log(JSON.stringify([{ type: "message", role: "developer", content: [{ type: "input_text", text }] }]));
    return;
  } else if (args[0] === "plugin" && args[1] === "marketplace") {
    const [action, target] = args.slice(2);
    if (action === "add") codexHost.addMarket(target);
    else if (action === "remove") codexHost.removeMarket(target);
    else if (action === "upgrade") state.codex.markets[target] ?? fail(`marketplace ${target} not found`);
    else fail(`unexpected: codex ${args.join(" ")}`);
  } else if (args[0] === "plugin" && args[1] === "add") codexHost.install(args[2]);
  else if (args[0] === "plugin" && args[1] === "remove") codexHost.uninstall(args[2]);
  else fail(`unexpected: codex ${args.join(" ")}`);
  save();
}

function agy() {
  const manifestPath = join(HOME, ".gemini", "config", "import_manifest.json");
  const imports = existsSync(manifestPath) ? readJson(manifestPath).imports ?? [] : [];
  const writeImports = (list) => {
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify({ imports: list.length ? list : null }, null, 2)}\n`);
  };
  const [noun, verb, target] = args;
  if (noun !== "plugin") fail(`unexpected: agy ${args.join(" ")}`);
  if (verb === "list") {
    console.log(JSON.stringify({ imports: imports.length ? imports : null }, null, 2));
  } else if (verb === "install") {
    const name = readJson(join(target, "plugin.json")).name;
    const destination = join(HOME, ".gemini", "config", "plugins", name);
    if (lexists(destination) && lstatSync(destination).isSymbolicLink()) fail(`refusing to write through the link ${destination}`);
    rmSync(destination, { recursive: true, force: true });
    cpSync(target, destination, { recursive: true });
    writeImports([...imports.filter((entry) => entry.name !== name), { name, source: "antigravity" }]);
    console.log(`Installed plugin "${name}"`);
  } else if (verb === "uninstall") {
    rmSync(join(HOME, ".gemini", "config", "plugins", target), { recursive: true, force: true });
    writeImports(imports.filter((entry) => entry.name !== target));
    console.log(`Uninstalled plugin "${target}"`);
  } else fail(`unexpected: agy ${args.join(" ")}`);
}

function ps() {
  if (args.includes("-p")) return;
  if (process.env.FAKE_PS) console.log(process.env.FAKE_PS);
}

({ claude, codex, agy, ps })[tool]?.() ?? null;
