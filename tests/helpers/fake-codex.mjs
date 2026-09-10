#!/usr/bin/env node
// tests/helpers/fake-codex.mjs
//
// A stand-in for the `codex` binary, for the Codex dev-install tests. It
// models the parts of `codex plugin` those scripts drive, against the real
// behavior of codex-cli 0.153.4 observed on 2026-09-09:
//
// - `plugin marketplace add <path>` registers the directory under the name in
//   its `.agents/plugins/marketplace.json`.
// - `plugin add <plugin>@<marketplace>` COPIES the marketplace root into
//   `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>`. It overwrites
//   whatever is already there, so it replaces a symlinked `skills/` with a
//   fresh copy — which is why the installer re-applies that link after every
//   add.
// - `plugin remove` deletes the cached version directory without following
//   symlinks inside it.
//
// State lives entirely under $HOME, so each test isolates with HOME=<tempdir>.
// Invocations are appended to $HOME/.fake-codex-calls for assertions.

import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME ?? "";
const REGISTRY = join(HOME, ".fake-codex-marketplaces.json");
const CALLS = join(HOME, ".fake-codex-calls");
const cachePath = (marketplace, plugin, version) =>
  join(HOME, ".codex", "plugins", "cache", marketplace, plugin, version);

const argv = process.argv.slice(2);
appendFileSync(CALLS, `${argv.join(" ")}\n`);

function readRegistry() {
  if (!existsSync(REGISTRY)) return [];
  return JSON.parse(readFileSync(REGISTRY, "utf8"));
}

function writeRegistry(entries) {
  writeFileSync(REGISTRY, JSON.stringify(entries));
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/** Split `plugin@marketplace` the way the real CLI does. */
function parseSelector(selector) {
  const at = selector.lastIndexOf("@");
  if (at < 1) fail(`error: expected PLUGIN@MARKETPLACE, got \`${selector}\``);
  return { plugin: selector.slice(0, at), marketplace: selector.slice(at + 1) };
}

function manifestVersion(root) {
  const manifest = join(root, ".codex-plugin", "plugin.json");
  if (!existsSync(manifest)) fail(`error: no .codex-plugin/plugin.json in ${root}`);
  return JSON.parse(readFileSync(manifest, "utf8")).version;
}

function marketplaceName(root) {
  const manifest = join(root, ".agents", "plugins", "marketplace.json");
  if (!existsSync(manifest)) fail(`error: no .agents/plugins/marketplace.json in ${root}`);
  return JSON.parse(readFileSync(manifest, "utf8")).name;
}

const [group, ...rest] = argv;
if (group !== "plugin") fail(`fake-codex: unsupported command \`${group}\``);

const [command, ...args] = rest;

if (command === "marketplace") {
  const [sub, ...subArgs] = args;
  const entries = readRegistry();

  if (sub === "list") {
    if (subArgs.includes("--json")) {
      process.stdout.write(
        JSON.stringify(
          entries.map((entry) => ({
            name: entry.name,
            root: entry.root,
            marketplaceSource: { sourceType: "local", source: entry.root },
          })),
        ),
      );
    } else {
      for (const entry of entries) process.stdout.write(`${entry.name}\t${entry.root}\n`);
    }
    process.exit(0);
  }

  if (sub === "add") {
    const root = subArgs.find((arg) => !arg.startsWith("-"));
    const name = marketplaceName(root);
    if (entries.some((entry) => entry.name === name)) {
      fail(`error: marketplace \`${name}\` is already configured`);
    }
    entries.push({ name, root, plugins: [] });
    writeRegistry(entries);
    process.stdout.write(`Added marketplace \`${name}\` from ${root}.\n`);
    process.exit(0);
  }

  if (sub === "remove") {
    const name = subArgs.find((arg) => !arg.startsWith("-"));
    if (!entries.some((entry) => entry.name === name)) {
      fail(`error: no configured marketplace named \`${name}\``);
    }
    writeRegistry(entries.filter((entry) => entry.name !== name));
    process.stdout.write(`Removed marketplace \`${name}\`.\n`);
    process.exit(0);
  }

  fail(`fake-codex: unsupported marketplace subcommand \`${sub}\``);
}

if (command === "list") {
  const installed = [];
  for (const entry of readRegistry()) {
    for (const plugin of entry.plugins) {
      installed.push({
        pluginId: `${plugin.name}@${entry.name}`,
        name: plugin.name,
        marketplaceName: entry.name,
        version: plugin.version,
        installed: true,
        enabled: true,
        source: { source: "local", path: entry.root },
      });
    }
  }
  if (args.includes("--json")) {
    process.stdout.write(JSON.stringify({ installed, available: [] }));
  } else {
    for (const entry of installed) {
      process.stdout.write(
        `${entry.pluginId}\tinstalled, enabled\t${entry.version}\t${entry.source.path}\n`,
      );
    }
  }
  process.exit(0);
}

if (command === "add") {
  const selector = args.find((arg) => !arg.startsWith("-"));
  const { plugin, marketplace } = parseSelector(selector);
  const entries = readRegistry();
  const entry = entries.find((candidate) => candidate.name === marketplace);
  if (!entry) fail(`error: no configured marketplace named \`${marketplace}\``);

  const version = manifestVersion(entry.root);
  const destination = cachePath(marketplace, plugin, version);
  // The real CLI overwrites an existing cache directory, replacing a
  // symlinked skills/ with a fresh copy.
  rmSync(destination, { force: true, recursive: true });
  mkdirSync(destination, { recursive: true });
  for (const name of [".codex-plugin", "skills", "agents"]) {
    const source = join(entry.root, name);
    if (existsSync(source)) cpSync(source, join(destination, name), { recursive: true });
  }
  entry.plugins = [
    ...entry.plugins.filter((candidate) => candidate.name !== plugin),
    { name: plugin, version },
  ];
  writeRegistry(entries);
  process.stdout.write(`Added plugin \`${plugin}\` from marketplace \`${marketplace}\`.\n`);
  process.stdout.write(`Installed plugin root: ${destination}\n`);
  process.exit(0);
}

if (command === "remove") {
  const selector = args.find((arg) => !arg.startsWith("-"));
  const { plugin, marketplace } = parseSelector(selector);
  const entries = readRegistry();
  const entry = entries.find((candidate) => candidate.name === marketplace);
  const installed = entry?.plugins.find((candidate) => candidate.name === plugin);
  if (!installed) fail(`error: plugin \`${plugin}@${marketplace}\` is not installed`);

  const pluginRoot = join(HOME, ".codex", "plugins", "cache", marketplace, plugin);
  if (existsSync(pluginRoot)) {
    // rmSync unlinks symlinks rather than descending them, which is what the
    // real CLI does: a symlinked skills/ loses the link, never the target.
    for (const version of readdirSync(pluginRoot)) {
      const path = join(pluginRoot, version);
      if (lstatSync(path).isSymbolicLink()) rmSync(path, { force: true });
      else rmSync(path, { force: true, recursive: true });
    }
  }
  entry.plugins = entry.plugins.filter((candidate) => candidate.name !== plugin);
  writeRegistry(entries);
  process.stdout.write(`Removed plugin \`${plugin}\` from marketplace \`${marketplace}\`.\n`);
  process.exit(0);
}

fail(`fake-codex: unsupported plugin subcommand \`${command}\``);
