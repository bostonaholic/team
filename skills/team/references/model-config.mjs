// Single owner of the `.team/config.json` schema and validation.
//
// Both consumers import this module so the contract cannot drift: the resolver
// (resolve-model.mjs) validates before selecting a model, and the session guard
// (hooks/validate-team-config.mjs) validates before a prompt is processed.
// Keep it pure and dependency-free: no I/O, no side effects, no host lookups.

export const HOSTS = ["codex", "antigravity"];
export const TIERS = ["opus", "sonnet", "haiku"];
export const EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"];
export const ANTIGRAVITY_MODELS = ["inherit", "flash_lite", "flash", "pro"];
export const CONFIG_DIR = ".team";
export const CONFIG_FILE = "config.json";

export function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

export function validateConfig(config) {
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
