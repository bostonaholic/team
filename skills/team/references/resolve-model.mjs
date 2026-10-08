#!/usr/bin/env node
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

import { CONFIG_DIR, CONFIG_FILE, EFFORTS, HOSTS, TIERS, object, validateConfig } from "./model-config.mjs";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path}: ${error.message}`, { cause: error });
  }
}

const CLASS_NAME = /^[a-z]+$/;

// Selection only: the caller supplies current host capabilities and performs the spawn.
export function resolveModel(request, overrides = {}, defaults = readJson(new URL("./model-defaults.json", import.meta.url))) {
  object(request, "request");
  const { host, tier, effort, available } = request;
  if (!HOSTS.includes(host)) throw new Error(`unsupported host: ${host}`);
  if (!TIERS.includes(tier)) throw new Error(`unsupported tier: ${tier}`);
  validateConfig(defaults);
  validateConfig(overrides);
  object(available, "available");
  for (const [model, efforts] of Object.entries(available)) {
    if (!Array.isArray(efforts) || efforts.some((value) => typeof value !== "string")) {
      throw new Error(`available.${model} must be an array of effort names`);
    }
  }
  const project = overrides[host]?.[tier];
  const selection = project ?? defaults[host]?.[tier];
  if (!selection) throw new Error(`missing model mapping: ${host}.${tier}`);
  const { model } = selection;
  const selectedEffort = selection.reasoning_effort ?? effort;
  let resolved;
  if (Object.hasOwn(available, model)) {
    if (host === "codex" && (!EFFORTS.includes(selectedEffort) || !available[model].includes(selectedEffort))) {
      throw new Error(`unsupported effort: ${model} / ${selectedEffort}`);
    }
    resolved = model;
  } else if (host === "codex" && CLASS_NAME.test(model)) {
    resolved = newestClassMember(available, tier, model, selectedEffort);
  } else {
    throw new Error(`unavailable model: ${host}.${tier} -> ${model}`);
  }
  return {
    host, tier, source: project ? "project" : "bundled",
    spawn: host === "codex"
      ? { model: resolved, reasoning_effort: selectedEffort, fork_turns: "none" }
      : { Model: resolved },
  };
}

// A member ID is <family>-<version>-<class>, with a non-empty family and a dotted integer version.
function memberVersion(id, modelClass) {
  const match = new RegExp(`^.+-(\\d+(?:\\.\\d+)*)-${modelClass}$`).exec(id);
  return match ? match[1].split(".").map(Number) : null;
}

function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function newestClassMember(available, tier, modelClass, effort) {
  if (!EFFORTS.includes(effort)) throw new Error(`unsupported effort: ${modelClass} / ${effort}`);
  const members = Object.keys(available)
    .map((id) => ({ id, version: memberVersion(id, modelClass) }))
    .filter((member) => member.version);
  if (members.length === 0) throw new Error(`no Codex model in class: codex.${tier} -> ${modelClass}`);
  const supported = members.filter((member) => available[member.id].includes(effort));
  if (supported.length === 0) {
    const ids = members.map((member) => member.id).join(", ");
    throw new Error(`unsupported effort: ${modelClass} / ${effort} (class members: ${ids})`);
  }
  const ranked = supported.toSorted((a, b) => compareVersions(b.version, a.version));
  const tied = ranked.filter((member) => compareVersions(member.version, ranked[0].version) === 0);
  if (tied.length > 1) {
    const ids = tied.map((member) => member.id).join(", ");
    throw new Error(`ambiguous model class: codex.${tier} -> ${modelClass} (tied: ${ids})`);
  }
  return ranked[0].id;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error("usage: node resolve-model.mjs <request.json|->");
    const request = readJson(process.argv[2] === "-" ? 0 : process.argv[2]);
    if (typeof request.projectRoot !== "string" || !isAbsolute(request.projectRoot)) {
      throw new Error("projectRoot must be an absolute path");
    }
    if (!statSync(request.projectRoot).isDirectory()) throw new Error("projectRoot must be a directory");
    const configPath = join(request.projectRoot, CONFIG_DIR, CONFIG_FILE);
    let overrides;
    try {
      overrides = readJson(configPath);
    } catch (error) {
      if (error.cause?.code !== "ENOENT") throw error;
      overrides = {};
    }
    process.stdout.write(`${JSON.stringify(resolveModel(request, overrides))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
