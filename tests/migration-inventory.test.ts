import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import { collectInventory, type Inventory, type InventoryIO } from "../scripts/migration-inventory";
import { skillNames } from "./helpers/skill-refs";

const REPO_ROOT = join(import.meta.dir, "..");
const REVISION = "1111111111111111111111111111111111111111";
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(files: Record<string, string | Buffer>): string {
  const root = mkdtempSync(join(tmpdir(), "migration-inventory-"));
  tempDirs.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const INSTRUCTIONS = {
  "skills/launch/SKILL.md": "---\nname: launch\ndescription: Launch\n---\nCall the Skill tool with `guide`.\n",
  "skills/launch/references/deep/notes.md": "Call the Skill tool with `guide`.\nCafé 雪\n",
  "skills/launch/references/empty.md": " \n\t",
  "skills/guide/SKILL.md": "---\nname: guide\ndescription: Guide\nuser-invocable: false\n---\nRead skills/idle/SKILL.md.\n",
  "skills/idle/SKILL.md": "---\nname: idle\ndescription: Idle\nuser-invocable: false\n---\nWait.\n",
  "skills/principle-rule/SKILL.md": "---\nname: principle-rule\ndescription: Rule\nuser-invocable: false\n---\nStop.\n",
  "skills/guarded/SKILL.md": "---\nname: guarded\ndescription: Guarded\ndisable-model-invocation: true\n---\nRun.\n",
  "agents/worker.md": "---\nname: worker\nskills:\n  - guide\n---\nCall the Skill tool with `principle-rule`.\n",
};

const RESOURCES = {
  "skills/launch/data.json": "{\"words\":\"do not count these\"}\n",
  "skills/launch/run.sh": "#!/bin/sh\nprintf 'resource only'\n",
  "skills/launch/agents/openai.yaml": "interface:\n  display_name: Launch\n",
  "skills/guide/agents/openai.yaml": "interface:\n  display_name: Guide\n",
  "skills/idle/agents/openai.yaml": "interface:\n  display_name: Idle\n",
  "skills/guarded/agents/openai.yaml": "interface:\n  display_name: Guarded\n",
  "skills/principle-rule/agents/openai.yaml": "interface:\n  display_name: Rule\n",
};

const CONFIG = {
  ".claude-plugin/plugin.json": "{\"name\":\"team\",\"version\":\"0.0.0\"}\n",
  ".codex-plugin/plugin.json": "{\"name\":\"team\",\"version\":\"0.0.0\"}\n",
  ".agents/plugins/marketplace.json": "{\"name\":\"fixture\",\"plugins\":[{\"name\":\"team\",\"source\":\"./\"}]}\n",
  "plugin.json": "{\"name\":\"team\",\"version\":\"0.0.0\"}\n",
  "opencode/team.js": readFileSync(join(REPO_ROOT, "opencode/team.js")),
  "opencode/catalog.mjs": readFileSync(join(REPO_ROOT, "opencode/catalog.mjs")),
};

const CLEAN: InventoryIO = { readGit: () => ({ revision: REVISION, dirtyPaths: [] }) };

function paths(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .sort();
}

function measurements(root: string, files: string[]) {
  return files.map((path) => {
    const bytes = readFileSync(join(root, path));
    return { path, words: bytes.toString("utf8").match(/\S+/gu)?.length ?? 0, bytes: bytes.length };
  });
}

function total(files: { words: number; bytes: number }[]) {
  return {
    files: files.length,
    words: files.reduce((sum, file) => sum + file.words, 0),
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
  };
}

function git(root: string, args: string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 10_000 });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function runReporter(root: string) {
  return spawnSync(process.execPath, [join(REPO_ROOT, "scripts/migration-inventory.ts"), root], {
    cwd: tmpdir(), encoding: "utf8", timeout: 10_000,
  });
}

function measuredCheckout() {
  const files = paths(join(REPO_ROOT, "skills")).map((path) => `skills/${path}`)
    .concat(paths(join(REPO_ROOT, "agents")).map((path) => `agents/${path}`))
    .filter((path) => path.endsWith(".md")).sort();
  const report = collectInventory(REPO_ROOT);
  expect(report.revision).toBe(git(REPO_ROOT, ["rev-parse", "HEAD"]));
  expect(report.files).toEqual(measurements(REPO_ROOT, files));
  expect(report.totals).toEqual(total(measurements(REPO_ROOT, files)));
  expect(report.skills.map((skill) => skill.name)).toEqual([...skillNames(REPO_ROOT)].sort());
  expect(report.registrations.skills).toBe(skillNames(REPO_ROOT).size);
  expect(report.registrations.agents).toBe(readdirSync(join(REPO_ROOT, "agents")).filter((name) => name.endsWith(".md")).length);
  expect(report.registrations.codexManifests).toBe(paths(join(REPO_ROOT, "skills")).filter((path) => path.endsWith("/agents/openai.yaml")).length);
  const cli = runReporter(REPO_ROOT);
  expect(cli.status, cli.stderr).toBe(0);
  expect(cli.stdout.trim().length, "reporter JSON on stdout").toBeGreaterThan(0);
  expect(JSON.parse(cli.stdout)).toEqual(report);
}

function unreadableFile(unreadable: string): InventoryIO["readFile"] {
  return (path) => {
    if (path === unreadable) throw new Error(`EACCES: cannot read ${path}`);
    return readFileSync(path);
  };
}

function readOnce(): InventoryIO["readFile"] {
  const seen = new Set<string>();
  return (path) => {
    expect(seen.has(path), `duplicate input read: ${path}`).toBe(false);
    seen.add(path);
    return readFileSync(path);
  };
}

function largeFixture(count: number): string {
  const files: Record<string, string | Buffer> = { ...INSTRUCTIONS, ...RESOURCES, ...CONFIG };
  for (let index = 0; index < count; index++) {
    const name = `extra-${index}`;
    files[`skills/${name}/SKILL.md`] = `---\nname: ${name}\ndescription: Extra\n---\nRead.\n`;
  }
  return fixture(files);
}

function readOrEmpty(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

interface Observation {
  id: string;
  command: string;
  revision: string;
  exitStatus: number | null;
  durationSeconds: number | null;
  stdout: string;
  stderr: string;
  unavailableReason?: string;
  counts?: { pass: number; skip?: number; fail: number; tests?: number; files?: number; suites?: number };
  skips?: { name: string; reason: string }[];
  failures?: { name: string; output: string; cause: null }[];
  runId?: string;
  attempt?: number;
}

// Replay the full suite outside this test, because invoking bun test here recurses.
// JSON evidence keeps command output testable without pinning surrounding prose.
function observations(markdown: string): Observation[] {
  const blocks = [...markdown.matchAll(/^```json\n([\s\S]*?)^```/gm)];
  const values = blocks.flatMap((match) => JSON.parse(match[1] ?? "null")?.observations ?? []);
  for (const value of values) {
    expect(structuredClone(value), `observation ${value.id}`).toMatchObject({
      id: expect.any(String), command: expect.any(String),
      revision: expect.stringMatching(/^[a-f0-9]{40}$/),
      stdout: expect.any(String), stderr: expect.any(String),
    });
    if (value.unavailableReason !== undefined) {
      expect(value.unavailableReason.length, value.id).toBeGreaterThan(0);
      expect(value.exitStatus, value.id).toBeNull();
    } else {
      expect(value.exitStatus, value.id).toBeInteger();
      if (value.durationSeconds !== null) expect(value.durationSeconds, value.id).toBeGreaterThanOrEqual(0);
      expect(value.stdout.length + value.stderr.length, `${value.id}: retained command output`).toBeGreaterThan(0);
    }
    for (const failure of value.failures ?? []) {
      expect(failure.output.length, `${value.id}: ${failure.name}`).toBeGreaterThan(0);
      expect(failure.cause, `${value.id}: ${failure.name}`).toBeNull();
    }
    for (const skip of value.skips ?? []) expect(skip.reason.length, skip.name).toBeGreaterThan(0);
  }
  return values;
}

function recordedInventory(path: string): Inventory {
  const source = readOrEmpty(path);
  expect(source.length, path).toBeGreaterThan(0);
  const report: Inventory = JSON.parse(source);
  expect(report.revision).toMatch(/^[a-f0-9]{40}$/);
  expect(report.inputs.length).toBeGreaterThan(0);
  expect(report.dirtyInputs).toEqual([]);
  expect(report.initialBaselineEligible).toBe(true);
  expect(report.files.length).toBeGreaterThan(0);
  expect(report.totals).toEqual(total(report.files));
  expect(report.registrations.skills).toBe(report.skills.length);
  expect(report.skills.length).toBeGreaterThan(0);
  return report;
}

function replayObservations(records: Observation[]) {
  for (const command of [
    "bun test", "bun run typecheck", "bash .claude/scripts/check-discovery-consistency.sh",
    "bun run eval:select", "bun test ./tests/migration-inventory.test.ts",
  ]) {
    expect(records.find((record) => record.id.startsWith("replay-") && record.command === command), command).toBeDefined();
  }
  const free = records.find((record) => record.id.startsWith("replay-") && record.command === "bun test");
  expect(structuredClone(free?.counts), "replayed free-suite counts").toMatchObject({ pass: expect.any(Number), skip: expect.any(Number), fail: expect.any(Number) });
  expect(`${free?.stdout}\n${free?.stderr}`, "replayed free-suite output").toContain(`${free?.counts?.pass} pass`);
  expect(`${free?.stdout}\n${free?.stderr}`, "replayed free-suite output").toContain(`${free?.counts?.fail} fail`);
}

function periodicAttempt(records: Observation[], attempt: number, pass: number, failures: string[]) {
  const record = records.find((value) => value.runId === "34619223350" && value.attempt === attempt);
  expect(record, `periodic run 34619223350 attempt ${attempt}`).toMatchObject({
    revision: "e5f8538c2183654fe814010a38e55b2d531623e8",
    counts: { pass, fail: failures.length },
  });
  expect(record?.failures?.map((failure) => failure.name).sort()).toEqual([...failures].sort());
}

describe("Slice 1: Reproduce the inventory and existing baseline results", () => {
  test("Inventory reproduces files, counts, and declared callers", () => {
    const root = fixture({ ...INSTRUCTIONS, ...RESOURCES, ...CONFIG });
    const report = collectInventory(root, CLEAN);

    expect(report.revision).toBe(REVISION);
    expect(report.dirtyInputs).toEqual([]);
    expect(report.initialBaselineEligible).toBe(true);
    expect(report.inputs).toEqual(paths(root));
    expect(report.files).toEqual(measurements(root, Object.keys(INSTRUCTIONS).sort()));
    expect(report.totals).toEqual(total(measurements(root, Object.keys(INSTRUCTIONS).sort())));
    expect(report.resources).toEqual(Object.keys(RESOURCES).sort());
    expect(report.categories).toEqual({ entry: 2, methodology: 2, principle: 1 });
    expect(report.registrations).toMatchObject({
      skills: 5, agents: 1, codexManifests: 5,
      opencode: { commands: 5, discoveryPaths: 4 },
      hosts: {
        claude: { count: 5, evidence: "source-derived", sources: [".claude-plugin/plugin.json"] },
        codex: { count: 5, evidence: "source-derived", sources: [".agents/plugins/marketplace.json", ".codex-plugin/plugin.json"] },
        antigravity: { count: 5, evidence: "source-derived", sources: ["plugin.json"] },
      },
    });
    expect(report.skills.map((skill) => skill.name)).toEqual(["guarded", "guide", "idle", "launch", "principle-rule"]);
    expect(report.skills.find((skill) => skill.name === "launch")).toMatchObject({
      category: "entry",
      root: { words: 12, bytes: 75 },
      totals: { files: 3, words: 20, bytes: 122 },
      callers: [],
    });
    expect(report.files.find((file) => file.path === "skills/launch/references/empty.md")).toEqual({
      path: "skills/launch/references/empty.md", words: 0, bytes: 3,
    });
    expect(report.skills.find((skill) => skill.name === "guide")?.callers).toEqual([
      { path: "agents/worker.md", kind: "preload" },
      { path: "skills/launch/SKILL.md", kind: "direct" },
      { path: "skills/launch/references/deep/notes.md", kind: "direct" },
    ]);
    expect(report.skills.find((skill) => skill.name === "principle-rule")?.callers).toEqual([
      { path: "agents/worker.md", kind: "direct" },
    ]);
    expect(report.skills.find((skill) => skill.name === "idle")?.callers).toEqual([]);
    expect(report.citations).toEqual([{ path: "skills/guide/SKILL.md", target: "skills/idle/SKILL.md" }]);
    measuredCheckout();
  });

  test("Invalid inventory evidence names its source", () => {
    const root = fixture({ ...INSTRUCTIONS, ...RESOURCES, ...CONFIG });
    const missing = join(root, "missing-root");
    const unreadable = join(root, "skills/launch/SKILL.md");
    const dangling = fixture({
      ...INSTRUCTIONS, ...RESOURCES, ...CONFIG,
      "skills/launch/SKILL.md": "---\nname: launch\ndescription: Launch\n---\nCall the Skill tool with `absent-skill`.\n",
    });

    expect(() => collectInventory(missing, CLEAN)).toThrow(missing);
    expect(() => collectInventory(root, { ...CLEAN, readFile: unreadableFile(unreadable) })).toThrow(unreadable);
    expect(() => collectInventory(dangling, CLEAN)).toThrow(/skills\/launch\/SKILL\.md.*absent-skill|absent-skill.*skills\/launch\/SKILL\.md/);
    const dirty = collectInventory(root, {
      readGit: () => ({ revision: REVISION, dirtyPaths: ["skills/launch/SKILL.md", "docs/unrelated.md", "plugin.json", ".codex-plugin/plugin.json", "skills/guide/agents/openai.yaml"] }),
    });
    expect(dirty.dirtyInputs).toEqual([".codex-plugin/plugin.json", "plugin.json", "skills/guide/agents/openai.yaml", "skills/launch/SKILL.md"]);
    expect(dirty.initialBaselineEligible).toBe(false);
    expect(collectInventory(root, CLEAN)).toEqual(collectInventory(root, CLEAN));
    expect(collectInventory(root, { ...CLEAN, readFile: readOnce() })).toEqual(collectInventory(root, CLEAN));
    expect(collectInventory(largeFixture(100), CLEAN).registrations.skills).toBe(105);
    const cli = runReporter(missing);
    expect(cli.status, cli.stderr).toBe(1);
    expect(cli.stderr).toContain(missing);
    expect(cli.stdout).toBe("");
  });

  test("Baseline commands leave reproducible observations", () => {
    const index = readOrEmpty(join(REPO_ROOT, "docs/verification/README.md"));
    const baseline = readOrEmpty(join(REPO_ROOT, "docs/verification/migration-baseline.md"));

    expect(index, "verification index command").toContain("bun run scripts/migration-inventory.ts <checkout-root>");
    expect(index).toContain("bun test ./tests/migration-inventory.test.ts");
    expect(index).toContain("bun test");
    expect(index).toContain("bun run typecheck");
    expect(index).toContain("bash .claude/scripts/check-discovery-consistency.sh");
    expect(index).toContain("bun run eval:select");
    expect(index).toContain("migration-baseline.md");
    expect(index).toContain("baselines/m01.json");
    expect(baseline.length, "retained baseline observations").toBeGreaterThan(0);
    const records = observations(baseline);
    expect(structuredClone(records.find((record) => record.id === "pre-change-free"))).toMatchObject({
      command: "bun test", revision: "e5f8538c2183654fe814010a38e55b2d531623e8", exitStatus: 0,
      counts: { pass: 2564, skip: 4, fail: 0, tests: 2568, files: 77 },
      stdout: expect.any(String), stderr: expect.any(String),
    });
    expect(records.find((record) => record.id === "pre-change-free")?.durationSeconds).toBeCloseTo(123.55, 2);
    expect(records.find((record) => record.id === "pre-change-free")?.stderr).toContain("2564 pass");
    expect(records.find((record) => record.id === "pre-change-free")?.stderr).toContain("4 skip");
    expect(records.find((record) => record.id === "pre-change-free")?.stderr).toContain("0 fail");
    expect(records.find((record) => record.id === "pre-change-free")?.skips?.map((skip) => skip.name).sort()).toEqual([
      ".claude/hooks/check-registry-sync.mjs", "hooks/post-write-validate.mjs", "hooks/pre-compact-anchor.mjs", "hooks/session-start-recover.mjs",
    ]);
    expect(structuredClone(records.find((record) => record.id === "typecheck-before-install"))).toMatchObject({
      command: "bun run typecheck", exitStatus: 127,
      stderr: expect.stringContaining("nodenv: tsc: command not found"),
    });
    expect(records.find((record) => record.id === "dependency-install")).toMatchObject({ command: "bun install --frozen-lockfile", exitStatus: 0 });
    expect(records.find((record) => record.id === "typecheck-after-install")).toMatchObject({ command: "bun run typecheck", exitStatus: 0 });
    periodicAttempt(records, 1, 16, [
      "core unslop behavior evaluation", "pipeline author behavior evaluation", "fresh DESIGN reviewer prose evaluation",
      "isolated Research producers and grounded assembly", "non-vendor helper prose contract:Explore",
      "non-vendor helper prose contract:vendor-courier", "named parent fallback on unreadable prose file",
    ]);
    expect(records.find((record) => record.runId === "34619223350" && record.attempt === 1)?.counts?.suites).toBe(11);
    periodicAttempt(records, 2, 6, [
      "core unslop behavior evaluation", "pipeline author behavior evaluation",
      "isolated Research producers and grounded assembly", "named parent fallback on unreadable prose file",
    ]);
    expect(structuredClone(records.find((record) => record.id === "local-paid-evals"))).toMatchObject({ exitStatus: null, unavailableReason: expect.any(String) });
    expect(structuredClone(records.find((record) => record.id === "golden-master"))).toMatchObject({ exitStatus: null, unavailableReason: expect.any(String) });
    recordedInventory(join(REPO_ROOT, "docs/verification/baselines/m01.json"));
    replayObservations(records);
  });
});
