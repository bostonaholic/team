// L1 metadata rules and L2 native contracts for the portable export. No schemas,
// network, host installs, or model calls are needed by these acceptance tests.
import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { skillNames } from "./helpers/skill-refs";

const ROOT = join(import.meta.dir, "..");
const MODULE = join(ROOT, "scripts/export-agent-plugin.ts");
const SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MANIFEST = { $schema: SCHEMA, name: "team" };
const SOURCE_PATH = "skills/example/SKILL.md";
const BODY = "\n\n# Example\n\nKeep `---` and café unchanged.\n\n```yaml\nkey: value\n```\n";
const PORTABLE = {
  name: "example",
  description: "Example skill",
  license: "MIT",
  compatibility: "A host with a shell",
  metadata: { author: "Team", revision: "1" },
  "allowed-tools": "Read Bash",
};
type Projection = { metadata: Record<string, unknown>; body: string; content: string; eligible: boolean };
type ExportModule = {
  validateManifest: (text: string, path: string) => Record<string, unknown>;
  projectSkill: (text: string, directory: string, path: string) => Projection;
};
const exporter: Partial<ExportModule> | null = existsSync(MODULE)
  ? await import(pathToFileURL(MODULE).href)
  : null;
const temporary: string[] = [];
afterAll(() => {
  for (const path of temporary) rmSync(path, { recursive: true, force: true });
});

// An absent implementation fails an explicit assertion; it never aborts imports
// or supplies a fake result that could accidentally satisfy a rejection case.
function manifest(text: string): Record<string, unknown> {
  expect(typeof exporter?.validateManifest, "exporter must expose validateManifest").toBe("function");
  return exporter!.validateManifest!(text, "plugin.json");
}
function project(text: string, directory = "example"): Projection {
  expect(typeof exporter?.projectSkill, "exporter must expose projectSkill").toBe("function");
  return exporter!.projectSkill!(text, directory, SOURCE_PATH);
}
function skill(metadata: Record<string, unknown>, body = BODY): string {
  return `---\n${Bun.YAML.stringify(metadata, null, 2)}\n---${body}`;
}
function withoutField(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const result = { ...value };
  delete result[key];
  return result;
}
function yamlDescription(description: string): string {
  return `---\nname: example\ndescription: ${description}\n---\n`;
}
function caught(operation: () => unknown): string {
  try {
    operation();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
function rejectManifest(value: unknown, rule: string) {
  expect(typeof exporter?.validateManifest, "exporter must expose validateManifest").toBe("function");
  const message = caught(() => manifest(JSON.stringify(value)));
  expect(message).toContain("plugin.json");
  expect(message.toLowerCase()).toContain(rule.toLowerCase());
}
function rejectSkill(text: string, rule: string, directory = "example") {
  expect(typeof exporter?.projectSkill, "exporter must expose projectSkill").toBe("function");
  const message = caught(() => project(text, directory));
  expect(message).toContain(SOURCE_PATH);
  expect(message.toLowerCase()).toContain(rule.toLowerCase());
}
function frontmatter(text: string): Record<string, unknown> {
  return Bun.YAML.parse(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1] ?? "") as Record<string, unknown>;
}
function guardedSource(): string[] {
  return [...skillNames(ROOT)].filter((name) => frontmatter(readFileSync(join(ROOT, "skills", name, "SKILL.md"), "utf8"))["disable-model-invocation"] === true).sort();
}

const INVALID_MANIFEST_FIELDS: [string, unknown][] = [
  ["$schema", 1], ["name", 1], ["version", 1], ["description", []],
  ["homepage", {}], ["repository", false], ["license", null], ["keywords", "team"],
  ["keywords", ["team", 1]], ["author", "Team"], ["author", []], ["author", null],
  ["author.name", { name: 1 }], ["author.email", { email: false }],
  ["author.url", { url: [] }], ["author.extra", { extra: "unaudited" }],
  ["extensions", null], ["extensions", []], ["extensions", { "dev.example": true }],
];
const INVALID_SKILL_FIELDS: [string, unknown][] = [
  ["name", 1], ["description", 1], ["description", null], ["license", []],
  ["compatibility", false], ["allowed-tools", ["Read"]], ["metadata", "author"],
  ["metadata", []], ["metadata", null], ["metadata", { revision: 1 }],
  ["metadata", { nested: { author: "Team" } }],
  ["effort", 1], ["argument-hint", []], ["user-invocable", "false"],
  ["disable-model-invocation", "true"], ["disable-model-invocation", "false"],
  ["disable-model-invocation", 0], ["disable-model-invocation", null],
];

describe("Validated portable metadata rejects audited violations", () => {
  test("accepts the required manifest identifiers without optional fields", () => {
    expect(manifest(JSON.stringify(MANIFEST))).toEqual(MANIFEST);
  });

  test("preserves every permitted manifest field without adding URL, email, semver, or SPDX rules", () => {
    const input = {
      ...MANIFEST, version: "release label", description: "", homepage: "local documentation",
      repository: "repository label", license: "custom license", keywords: ["", "team"],
      author: { name: "", email: "not an email", url: "not a URL" },
    };
    expect(manifest(JSON.stringify(input))).toEqual(input);
  });

  test("accepts an empty author object and empty keyword list", () => {
    expect(manifest(JSON.stringify({ ...MANIFEST, author: {}, keywords: [] }))).toMatchObject({ author: {}, keywords: [] });
  });

  test("malformed JSON names the source path and JSON rule", () => {
    expect(typeof exporter?.validateManifest).toBe("function");
    const message = caught(() => manifest('{"name":'));
    expect(message).toContain("plugin.json");
    expect(message).toMatch(/json/i);
  });

  test.each([[null], [[]], ["team"], [7], [true]])("rejects a non-object manifest root: %j", (value) => {
    rejectManifest(value, "object");
  });
  test.each(["$schema", "name"])("requires manifest identifier %s", (key) => {
    rejectManifest(withoutField(MANIFEST, key), key);
  });
  test.each(INVALID_MANIFEST_FIELDS)("rejects wrong manifest type or closed author field %s: %j", (field, value) => {
    const key = field.split(".")[0]!;
    rejectManifest({ ...MANIFEST, [key]: value }, field.split(".").at(-1)!);
  });
  test("rejects an unknown manifest field", () => {
    rejectManifest({ ...MANIFEST, extra: "unaudited" }, "extra");
  });
  test.each(["", "https://agent-plugins.org/schemas/2.0.0/plugin.schema.json"])("rejects noncanonical schema %s", (schema) => {
    rejectManifest({ ...MANIFEST, $schema: schema }, "$schema");
  });
  test.each(["a", "0", "a".repeat(64), "my.plugin-2", "a.-b"])("accepts plugin name %s", (name) => {
    expect(manifest(JSON.stringify({ ...MANIFEST, name })).name).toBe(name);
  });
  test.each(["", "a".repeat(65), "-a", "a-", ".a", "a.", "A", "a_b", "a b", "a--b", "a..b", "é"])("rejects plugin name %s", (name) => {
    rejectManifest({ ...MANIFEST, name }, "name");
  });
  test.each([{}, { "dev.example": {} }])("refuses unaudited extensions profile %j", (extensions) => {
    rejectManifest({ ...MANIFEST, extensions }, "audit");
  });
  test.each(["mcp", "mcpServers"])("refuses unaudited %s configuration", (field) => {
    rejectManifest({ ...MANIFEST, [field]: {} }, field);
  });

  test.each([
    ['"quoted: value"', "quoted: value"],
    [">\n  folded\n  description", "folded description\n"],
    ["|\n  literal\n  description", "literal\ndescription\n"],
  ])("parses semantic YAML description %s", (yaml, description) => {
    expect(project(yamlDescription(yaml)).metadata.description).toBe(description);
  });
  test.each([
    ["# No frontmatter\n", "frontmatter"], ["---\nname: example\n", "frontmatter"],
    ["---\nname: [\n---\n", "yaml"], ["---\n- example\n---\n", "mapping"],
    ["---\nexample\n---\n", "mapping"], ["---\nnull\n---\n", "mapping"],
  ])("rejects malformed or non-mapping frontmatter %s", (text, rule) => {
    rejectSkill(text, rule);
  });
  test.each(["name", "description"])("requires skill field %s", (key) => {
    rejectSkill(skill(withoutField(PORTABLE, key)), key);
  });
  test("requires skill name to match its directory", () => {
    rejectSkill(skill(PORTABLE), "name", "different");
  });
  test.each(["a", "a".repeat(64), "example-2"])("accepts skill name %s", (name) => {
    expect(project(skill({ ...PORTABLE, name }), name).metadata.name).toBe(name);
  });
  test.each(["", "a".repeat(65), "-a", "a-", "a--b", "A", "a_b", "a.b", "a b"])("rejects skill name %s", (name) => {
    rejectSkill(skill({ ...PORTABLE, name }), "name", name);
  });
  test.each([1, 1024])("accepts description length %i", (length) => {
    const description = "x".repeat(length);
    expect(project(skill({ ...PORTABLE, description })).metadata.description).toBe(description);
  });
  test.each([0, 1025])("rejects description length %i", (length) => {
    rejectSkill(skill({ ...PORTABLE, description: "x".repeat(length) }), "description");
  });
  test("rejects whitespace-only skill descriptions", () => {
    rejectSkill(skill({ ...PORTABLE, description: "   " }), "description");
  });
  test.each([
    ["U+0085", "\u0085"],
    ["U+001C", "\u001c"],
    ["U+001D", "\u001d"],
    ["U+001E", "\u001e"],
    ["U+001F", "\u001f"],
  ])("rejects Unicode-only whitespace description %s as empty", (_label, description) => {
    rejectSkill(skill({ ...PORTABLE, description }), "description");
  });
  test("preserves a valid 513-emoji description unchanged", () => {
    const description = "😀".repeat(513);
    expect(caught(() => project(skill({ ...PORTABLE, description })))).toBe("");
    expect(project(skill({ ...PORTABLE, description })).metadata.description).toBe(description);
  });
  test("preserves a valid 251-emoji compatibility unchanged", () => {
    const compatibility = "😀".repeat(251);
    expect(caught(() => project(skill({ ...PORTABLE, compatibility })))).toBe("");
    expect(project(skill({ ...PORTABLE, compatibility })).metadata.compatibility).toBe(compatibility);
  });
  test.each([1, 500])("accepts compatibility length %i", (length) => {
    const compatibility = "x".repeat(length);
    expect(project(skill({ ...PORTABLE, compatibility })).metadata.compatibility).toBe(compatibility);
  });
  test.each([0, 501])("rejects compatibility length %i", (length) => {
    rejectSkill(skill({ ...PORTABLE, compatibility: "x".repeat(length) }), "compatibility");
  });
  test.each(INVALID_SKILL_FIELDS)("rejects wrong source type for %s: %j", (field, value) => {
    rejectSkill(skill({ ...PORTABLE, [field]: value }), field);
  });
  test("accepts optional strings and a string-to-string metadata mapping", () => {
    const result = project(skill({ ...PORTABLE, license: "", "allowed-tools": "", metadata: { "": "", revision: "1" } }));
    expect(result.metadata).toMatchObject({ license: "", "allowed-tools": "", metadata: { "": "", revision: "1" } });
  });
  test("accepts absent optional fields", () => {
    expect(project(skill({ name: "example", description: "Example skill" })).metadata).toEqual({ name: "example", description: "Example skill" });
  });
  test("preserves the six published fields and removes only typed native fields", () => {
    const result = project(skill({ ...PORTABLE, effort: "high", "argument-hint": "<task>", "user-invocable": false, "disable-model-invocation": false }));
    expect(result.metadata).toEqual(PORTABLE);
    expect(frontmatter(result.content)).toEqual(PORTABLE);
  });
  test("retains the exact Markdown suffix after projected frontmatter", () => {
    const result = project(skill({ ...PORTABLE, effort: "high" }, BODY));
    expect(result.body).toBe(BODY);
    expect(result.content.slice(result.content.indexOf("---", 3) + 3)).toBe(BODY);
  });
  test("rejects an unaudited source key instead of silently stripping it", () => {
    rejectSkill(skill({ ...PORTABLE, future: true }), "future");
    rejectSkill(skill({ ...PORTABLE, future: true }), "audit");
  });
  test.each([true, false])("uses boolean invocation control %j for discovery eligibility", (guarded) => {
    expect(project(skill({ ...PORTABLE, "disable-model-invocation": guarded })).eligible).toBe(!guarded);
  });
  test("absent invocation control leaves discovery eligible", () => {
    expect(project(skill(PORTABLE)).eligible).toBe(true);
  });
  test.each([true, false])("user-invocable %j remains a presentation hint", (visible) => {
    expect(project(skill({ ...PORTABLE, "user-invocable": visible })).eligible).toBe(true);
  });
  test("root manifest declares the canonical schema", () => {
    expect(JSON.parse(readFileSync(join(ROOT, "plugin.json"), "utf8")).$schema).toBe(SCHEMA);
  });
  test("native guarded declarations retain their authoritative boolean controls", () => {
    expect(guardedSource()).toEqual(["no-comments", "pr-rebase", "pr-watch-as-reviewer", "reflect"]);
  });
  test("importing the module with a destination argument creates no output", () => {
    const directory = mkdtempSync(join(tmpdir(), "agent-plugin-import-"));
    temporary.push(directory);
    const result = spawnSync(process.execPath, ["--eval", "await import(process.argv[1]);", pathToFileURL(MODULE).href, join(directory, "output")], { cwd: directory, encoding: "utf8" });
    expect({ status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 });
    expect(result.stdout).toBe("");
    expect(readdirSync(directory)).toEqual([]);
  });
});
