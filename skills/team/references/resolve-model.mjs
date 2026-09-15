#!/usr/bin/env node
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

const HOSTS = ["codex", "antigravity"];
const TIERS = ["opus", "sonnet", "haiku"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"];
const ANTIGRAVITY_MODELS = ["inherit", "flash_lite", "flash", "pro"];

function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function validateConfig(config) {
  object(config, "model config");
  for (const [host, tiers] of Object.entries(config)) {
    if (!HOSTS.includes(host)) throw new Error(`unsupported host: ${host}`);
    object(tiers, host);
    for (const [tier, selection] of Object.entries(tiers)) {
      if (!TIERS.includes(tier)) throw new Error(`unsupported tier: ${host}.${tier}`);
      object(selection, `${host}.${tier}`);
      const keys = host === "codex" ? ["model", "reasoning_effort"] : ["model"];
      for (const key of Object.keys(selection)) {
        if (!keys.includes(key)) throw new Error(`unknown field: ${host}.${tier}.${key}`);
      }
      const { model, reasoning_effort: effort } = selection;
      if (typeof model !== "string" || !model.trim() || model !== model.trim()) {
        throw new Error(`invalid model: ${host}.${tier}`);
      }
      if (host === "antigravity" && !ANTIGRAVITY_MODELS.includes(model)) {
        throw new Error(`invalid Antigravity model tier: ${model}`);
      }
      if (host === "codex" && [...TIERS, "fable", "inherit"].includes(model)) {
        throw new Error(`Codex needs a concrete model ID: ${model}`);
      }
      if (Object.hasOwn(selection, "reasoning_effort") && !EFFORTS.includes(effort)) {
        throw new Error(`unsupported effort: ${effort}`);
      }
    }
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path}: ${error.message}`, { cause: error });
  }
}

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
  if (!Object.hasOwn(available, model)) throw new Error(`unavailable model: ${host}.${tier} -> ${model}`);
  const selectedEffort = selection.reasoning_effort ?? effort;
  if (host === "codex" && (!EFFORTS.includes(selectedEffort) || !available[model].includes(selectedEffort))) {
    throw new Error(`unsupported effort: ${model} / ${selectedEffort}`);
  }
  return {
    host, tier, source: project ? "project" : "bundled",
    spawn: host === "codex"
      ? { model, reasoning_effort: selectedEffort, fork_turns: "none" }
      : { Model: model },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error("usage: node resolve-model.mjs <request.json|->");
    const request = readJson(process.argv[2] === "-" ? 0 : process.argv[2]);
    if (typeof request.projectRoot !== "string" || !isAbsolute(request.projectRoot)) {
      throw new Error("projectRoot must be an absolute path");
    }
    if (!statSync(request.projectRoot).isDirectory()) throw new Error("projectRoot must be a directory");
    const configPath = join(request.projectRoot, ".team", "config.json");
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
