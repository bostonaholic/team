// Fails when Codex model selection picks the wrong catalog ID for a class or pin, or reports the wrong error.
import assert from "node:assert/strict";
import test from "node:test";

import { resolveModel } from "../skills/team/references/resolve-model.mjs";

const ALL_SIX = Object.freeze(["low", "medium", "high", "xhigh", "max", "ultra"]);
const FIVE = Object.freeze(["low", "medium", "high", "xhigh", "max"]);
const FOUR = Object.freeze(["low", "medium", "high", "xhigh"]);

// Codex catalog captured 2026-10-08: catalog ID -> supported efforts.
const CATALOG = Object.freeze({
  "gpt-6.1-sol": ALL_SIX,
  "gpt-6-astra": ALL_SIX,
  "gpt-6-sol": ALL_SIX,
  "gpt-6-luna": FIVE,
  "gpt-reserve": FIVE,
  "gpt-5.6-sol": ALL_SIX,
  "gpt-5.6-terra": ALL_SIX,
  "gpt-5.6-luna": FIVE,
  "gpt-5.5": FOUR,
  "codex-auto-review": FIVE,
});

const CLASS_DEFAULTS = Object.freeze({
  codex: { opus: { model: "astra" }, sonnet: { model: "sol" }, haiku: { model: "luna" } },
});

function resolveOrFail(request, overrides, defaults) {
  try {
    return resolveModel(request, overrides, defaults);
  } catch (error) {
    assert.fail(`resolveModel threw: ${error.message}`);
  }
}

function thrownError(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  assert.fail("expected resolveModel to throw");
}

const BUNDLED_ROWS = [
  { tier: "opus", effort: "medium", expected: "gpt-6-astra" },
  { tier: "sonnet", effort: "high", expected: "gpt-6.1-sol" },
  { tier: "haiku", effort: "low", expected: "gpt-6-luna" },
];

for (const row of BUNDLED_ROWS) {
  test(`bundled Codex tiers resolve to the newest member of their class: ${row.tier}`, () => {
    const request = { host: "codex", tier: row.tier, effort: row.effort, available: CATALOG };

    const result = resolveOrFail(request, {});

    assert.equal(result.spawn.model, row.expected);
  });
}

const SELECTION_ROWS = [
  {
    label: "version 5.10 beats 5.9 by integer compare",
    request: { host: "codex", tier: "sonnet", effort: "high", available: { "gpt-5.9-sol": ALL_SIX, "gpt-5.10-sol": ALL_SIX } },
    overrides: {},
    expected: "gpt-5.10-sol",
  },
  {
    label: "a hyphenated family is a class member",
    request: { host: "codex", tier: "sonnet", effort: "high", available: { ...CATALOG, "gpt-oss-7-sol": ALL_SIX } },
    overrides: {},
    expected: "gpt-oss-7-sol",
  },
  {
    label: "a tie below the highest version does not matter",
    request: {
      host: "codex", tier: "sonnet", effort: "high",
      available: { "gpt-6.1-sol": ALL_SIX, "gpt-6-sol": ALL_SIX, "gpt-6.0-sol": ALL_SIX },
    },
    overrides: {},
    expected: "gpt-6.1-sol",
  },
  {
    label: "an older member wins when the newest lacks the effort",
    request: { host: "codex", tier: "sonnet", effort: "ultra", available: { "gpt-6.1-sol": FIVE, "gpt-6-sol": ALL_SIX } },
    overrides: {},
    expected: "gpt-6-sol",
  },
  {
    label: "a dated snapshot is not a class member",
    request: { host: "codex", tier: "sonnet", effort: "high", available: { ...CATALOG, "gpt-7-sol-2026-10-01": ALL_SIX } },
    overrides: {},
    expected: "gpt-6.1-sol",
  },
  {
    label: "a pinned ID resolves as written while a newer member exists",
    request: { host: "codex", tier: "haiku", effort: "low", available: CATALOG },
    overrides: { codex: { haiku: { model: "gpt-5.6-luna" } } },
    expected: "gpt-5.6-luna",
  },
  {
    label: "a class-shaped value that is an exact catalog key resolves to that key",
    request: { host: "codex", tier: "sonnet", effort: "high", available: { sol: ALL_SIX, "gpt-6.1-sol": ALL_SIX } },
    overrides: {},
    expected: "sol",
  },
];

for (const row of SELECTION_ROWS) {
  test(`a Codex selection resolves to the expected catalog ID: ${row.label}`, () => {
    const result = resolveOrFail(row.request, row.overrides, CLASS_DEFAULTS);

    assert.equal(result.spawn.model, row.expected);
  });
}

test("a Codex selection resolves to the expected catalog ID: a project class override resolves with source project", () => {
  const request = { host: "codex", tier: "sonnet", effort: "high", available: CATALOG };
  const overrides = { codex: { sonnet: { model: "terra" } } };

  const result = resolveOrFail(request, overrides, CLASS_DEFAULTS);

  assert.equal(result.spawn.model, "gpt-5.6-terra");
  assert.equal(result.source, "project");
});

const ERROR_ROWS = [
  {
    label: "an empty catalog has no class member",
    request: { host: "codex", tier: "sonnet", effort: "high", available: {} },
    overrides: {},
    defaults: CLASS_DEFAULTS,
    message: /^no Codex model in class: codex\.sonnet -> sol/,
  },
  {
    label: "an unknown class has no member",
    request: { host: "codex", tier: "haiku", effort: "low", available: CATALOG },
    overrides: { codex: { haiku: { model: "nova" } } },
    defaults: CLASS_DEFAULTS,
    message: /^no Codex model in class: codex\.haiku -> nova/,
  },
  {
    label: "a non-numeric version part is not a member",
    request: { host: "codex", tier: "opus", effort: "medium", available: CATALOG },
    overrides: { codex: { opus: { model: "review" } } },
    defaults: CLASS_DEFAULTS,
    message: /^no Codex model in class: codex\.opus -> review/,
  },
  {
    label: "a two-part ID is not a member",
    request: { host: "codex", tier: "haiku", effort: "low", available: CATALOG },
    overrides: { codex: { haiku: { model: "reserve" } } },
    defaults: CLASS_DEFAULTS,
    message: /^no Codex model in class: codex\.haiku -> reserve/,
  },
  {
    label: "an unknown effort on the class path is unsupported, not a TypeError",
    request: { host: "codex", tier: "sonnet", effort: "bogus", available: CATALOG },
    overrides: {},
    defaults: CLASS_DEFAULTS,
    message: /^unsupported effort: sol \/ bogus/,
  },
  {
    label: "a pin absent from the catalog is unavailable",
    request: { host: "codex", tier: "haiku", effort: "low", available: { "gpt-6-luna": FIVE } },
    overrides: { codex: { haiku: { model: "gpt-5.6-luna" } } },
    defaults: CLASS_DEFAULTS,
    message: /^unavailable model: codex\.haiku -> gpt-5\.6-luna$/,
  },
  {
    label: "a mixed-case value is not a class",
    request: { host: "codex", tier: "haiku", effort: "low", available: CATALOG },
    overrides: { codex: { haiku: { model: "Luna" } } },
    defaults: CLASS_DEFAULTS,
    message: /^unavailable model: codex\.haiku -> Luna$/,
  },
  {
    label: "Codex rejects the Claude alias opus",
    request: { host: "codex", tier: "sonnet", effort: "high", available: CATALOG },
    overrides: { codex: { sonnet: { model: "opus" } } },
    defaults: CLASS_DEFAULTS,
    message: /must be a Codex class or model ID/,
  },
  {
    label: "Codex rejects the Claude alias sonnet",
    request: { host: "codex", tier: "sonnet", effort: "high", available: CATALOG },
    overrides: { codex: { sonnet: { model: "sonnet" } } },
    defaults: CLASS_DEFAULTS,
    message: /must be a Codex class or model ID/,
  },
  {
    label: "Codex rejects the Claude alias haiku",
    request: { host: "codex", tier: "sonnet", effort: "high", available: CATALOG },
    overrides: { codex: { sonnet: { model: "haiku" } } },
    defaults: CLASS_DEFAULTS,
    message: /must be a Codex class or model ID/,
  },
  {
    label: "Codex rejects fable",
    request: { host: "codex", tier: "sonnet", effort: "high", available: CATALOG },
    overrides: { codex: { sonnet: { model: "fable" } } },
    defaults: CLASS_DEFAULTS,
    message: /must be a Codex class or model ID/,
  },
  {
    label: "Codex rejects inherit",
    request: { host: "codex", tier: "sonnet", effort: "high", available: CATALOG },
    overrides: { codex: { sonnet: { model: "inherit" } } },
    defaults: CLASS_DEFAULTS,
    message: /must be a Codex class or model ID/,
  },
  {
    label: "an Antigravity tier missing from available is unavailable",
    request: { host: "antigravity", tier: "sonnet", effort: "high", available: { pro: [], flash_lite: [] } },
    overrides: {},
    defaults: undefined,
    message: /^unavailable model: antigravity\.sonnet -> flash$/,
  },
];

for (const row of ERROR_ROWS) {
  test(`a Codex selection that cannot resolve throws a named error: ${row.label}`, () => {
    assert.throws(
      () => resolveModel(row.request, row.overrides, row.defaults),
      { name: "Error", message: row.message },
    );
  });
}

const ERROR_NAMING_IDS_ROWS = [
  {
    label: "two members tie at the highest version",
    request: { host: "codex", tier: "sonnet", effort: "high", available: { "gpt-6-sol": ALL_SIX, "gpt-6.0-sol": ALL_SIX } },
    message: /^ambiguous model class: codex\.sonnet -> sol/,
    firstId: /gpt-6-sol/,
    secondId: /gpt-6\.0-sol/,
  },
  {
    label: "two families tie at the highest version",
    request: { host: "codex", tier: "sonnet", effort: "high", available: { "gpt-6-sol": ALL_SIX, "gpt-oss-6-sol": ALL_SIX } },
    message: /^ambiguous model class: codex\.sonnet -> sol/,
    firstId: /gpt-6-sol/,
    secondId: /gpt-oss-6-sol/,
  },
  {
    label: "no class member supports the effort",
    request: { host: "codex", tier: "haiku", effort: "ultra", available: CATALOG },
    message: /^unsupported effort: luna \/ ultra/,
    firstId: /gpt-6-luna/,
    secondId: /gpt-5\.6-luna/,
  },
];

for (const row of ERROR_NAMING_IDS_ROWS) {
  test(`a Codex selection that cannot resolve throws a named error: ${row.label}`, () => {
    const error = thrownError(() => resolveModel(row.request, {}, CLASS_DEFAULTS));

    assert.match(error.message, row.message);
    assert.match(error.message, row.firstId);
    assert.match(error.message, row.secondId);
  });
}

const CONFIGURED_ROWS = [
  {
    label: "a bundled class is reported beside the resolved ID",
    request: { host: "codex", tier: "sonnet", effort: "high", available: CATALOG },
    overrides: {},
    defaults: undefined,
    configured: "sol",
    spawnField: "model",
    spawnValue: "gpt-6.1-sol",
  },
  {
    label: "a project pin is reported as the pin",
    request: { host: "codex", tier: "haiku", effort: "low", available: CATALOG },
    overrides: { codex: { haiku: { model: "gpt-5.6-luna" } } },
    defaults: CLASS_DEFAULTS,
    configured: "gpt-5.6-luna",
    spawnField: "model",
    spawnValue: "gpt-5.6-luna",
  },
  {
    label: "an Antigravity bundled tier word is reported",
    request: { host: "antigravity", tier: "sonnet", effort: "high", available: { flash: [] } },
    overrides: {},
    defaults: undefined,
    configured: "flash",
    spawnField: "Model",
    spawnValue: "flash",
  },
];

for (const row of CONFIGURED_ROWS) {
  test(`resolver output names the configured model: ${row.label}`, () => {
    const result = resolveOrFail(row.request, row.overrides, row.defaults);

    assert.equal(result.configured, row.configured);
    assert.equal(result.spawn[row.spawnField], row.spawnValue);
  });
}
