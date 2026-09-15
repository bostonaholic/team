import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
// @ts-expect-error Runtime helper is plain JavaScript.
import { resolveModel } from "../skills/team/references/resolve-model.mjs";

const available = {
  "gpt-6-astra": ["low", "medium", "high", "xhigh"],
  "gpt-5.6-sol": ["low", "medium", "high", "xhigh"],
  "gpt-5.6-luna": ["low", "medium", "high"],
};
const request = { host: "codex", tier: "opus", effort: "high", available };

describe("model selection", () => {
  test.each([
    ["opus", "gpt-6-astra"], ["sonnet", "gpt-5.6-sol"], ["haiku", "gpt-5.6-luna"],
  ])("Codex %s selects %s with the agent effort", (tier, model) => {
    expect(resolveModel({ ...request, tier }).spawn).toEqual({ model, reasoning_effort: "high", fork_turns: "none" });
  });

  test.each([["opus", "pro"], ["sonnet", "flash"], ["haiku", "flash_lite"]])(
    "Antigravity %s selects native tier %s", (tier, model) => {
      expect(resolveModel({ host: "antigravity", tier, effort: "xhigh", available: { pro: [], flash: [], flash_lite: [] } }).spawn)
        .toEqual({ Model: model });
    },
  );

  test("a partial project override replaces one selection, without mutating the inputs", () => {
    const overrides = { codex: { opus: { model: "custom-model", reasoning_effort: "low" } } };
    const before = JSON.stringify(overrides);
    const selected = resolveModel({ ...request, available: { "custom-model": ["low"] } }, overrides);
    expect(selected.spawn).toEqual({ model: "custom-model", reasoning_effort: "low", fork_turns: "none" });
    expect(selected.source).toBe("project");
    expect(resolveModel({ ...request, tier: "sonnet" }, overrides).source).toBe("bundled");
    expect(JSON.stringify(overrides)).toBe(before);
  });

  test("unavailable models and unsupported effort never become defaults", () => {
    expect(() => resolveModel({ ...request, available: {} })).toThrow("unavailable model");
    expect(() => resolveModel({ ...request, effort: "xhigh", tier: "haiku" })).toThrow("unsupported effort");
    expect(() => resolveModel({ ...request, effort: undefined })).toThrow("unsupported effort");
  });

  test.each([
    null, [], { codxe: {} }, { codex: { opuss: { model: "x" } } },
    { codex: { opus: null } }, { codex: { opus: { model: "" } } },
    { codex: { opus: { model: "opus" } } },
    { codex: { opus: { model: "gpt-6-astra", effort: "high" } } },
    { antigravity: { opus: { model: "gemini-3.1-pro-low" } } },
    { antigravity: { opus: { model: "pro", reasoning_effort: "high" } } },
  ].map((config) => ({ config })))("rejects invalid config %j", ({ config }) => {
    expect(() => resolveModel(request, config)).toThrow();
  });

  test("unknown hosts, tiers, and missing capability evidence fail", () => {
    expect(() => resolveModel({ ...request, host: "unknown" })).toThrow("unsupported host");
    expect(() => resolveModel({ ...request, tier: "fable" })).toThrow("unsupported tier");
    expect(() => resolveModel({ ...request, available: undefined })).toThrow("available");
    expect(() => resolveModel({ ...request, available: { "gpt-6-astra": "high" } })).toThrow("available");
    expect(() => resolveModel({ host: "antigravity", tier: "haiku", available: { flash: [] } })).toThrow("unavailable model");
  });
});

describe("installed resolver CLI", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

  function fixture() {
    const root = mkdtempSync(join(tmpdir(), "team models "));
    roots.push(root);
    const installed = join(root, "installed");
    cpSync(resolve("skills/team/references"), installed, { recursive: true });
    const projectRoot = join(root, "consumer");
    mkdirSync(projectRoot);
    const input = join(root, "request.json");
    writeFileSync(input, JSON.stringify({ ...request, projectRoot }));
    const run = () => spawnSync("node", [join(installed, "resolve-model.mjs"), input], { cwd: root, encoding: "utf8" });
    return { root, installed, projectRoot, input, run };
  }

  test("loads bundled defaults relative to installation and config only from the supplied project", () => {
    const f = fixture();
    expect(f.run().status).toBe(0);
    expect(JSON.parse(f.run().stdout).source).toBe("bundled");
    mkdirSync(join(f.projectRoot, ".team"));
    writeFileSync(join(f.projectRoot, ".team/config.json"), JSON.stringify({ codex: { opus: { model: "gpt-5.6-sol" } } }));
    const result = f.run();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).spawn.model).toBe("gpt-5.6-sol");
  });

  test("malformed config, missing defaults, and invalid project roots fail with no selection", () => {
    const f = fixture();
    mkdirSync(join(f.projectRoot, ".team"));
    const config = join(f.projectRoot, ".team/config.json");
    writeFileSync(config, "{");
    expect(f.run().status).toBe(1);
    expect(f.run().stdout).toBe("");
    expect(f.run().stderr).toContain(config);
    rmSync(config);
    writeFileSync(f.input, JSON.stringify({ ...request, projectRoot: "consumer" }));
    expect(f.run().status).toBe(1);
    writeFileSync(f.input, JSON.stringify({ ...request, projectRoot: join(f.root, "missing") }));
    expect(f.run().status).toBe(1);
    writeFileSync(f.input, JSON.stringify({ ...request, projectRoot: f.input }));
    expect(f.run().status).toBe(1);
    writeFileSync(f.input, JSON.stringify({ ...request, projectRoot: f.projectRoot }));
    rmSync(join(f.installed, "model-defaults.json"));
    expect(f.run().status).toBe(1);
  });

  test("read-only callers can supply the request on stdin", () => {
    const f = fixture();
    const result = spawnSync("node", [join(f.installed, "resolve-model.mjs"), "-"], {
      cwd: f.root, encoding: "utf8", input: JSON.stringify({ ...request, projectRoot: f.projectRoot }),
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).spawn.model).toBe("gpt-6-astra");
  });

  test("the installed dispatch contract links to the resolver procedure", () => {
    const f = fixture();
    const body = readFileSync(join(f.installed, "15-host-dispatch.md"), "utf8");
    expect(body).toContain("](model-selection.md)");
    const procedure = readFileSync(join(f.installed, "model-selection.md"), "utf8");
    expect(procedure).toContain("resolve-model.mjs");
  });
});
