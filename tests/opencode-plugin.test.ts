import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, readdirSync, renameSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { REPO, expectStatus, fixture, load, rejection, run, skill, state, write, type Config, type Fixture } from "./helpers/opencode";

const fixtures: Fixture[] = [];
function make(name = "checkout", catalog: "one" | "empty" | "full" = "one") { const f = fixture(name, catalog); fixtures.push(f); return f; }
afterEach(() => { for (const f of fixtures.splice(0)) f.dispose(); });

const badHeaders = [
  ["missing header", "# no frontmatter\n"],
  ["unclosed header", "---\nname: sample\ndescription: missing close\n"],
  ["missing name", "---\ndescription: Missing name\n---\n"],
  ["missing description", "---\nname: sample\n---\n"],
  ["duplicate name key", "---\nname: sample\nname: second\ndescription: Duplicate\n---\n"],
  ["duplicate description key", "---\nname: sample\ndescription: First\ndescription: Second\n---\n"],
  ["duplicate guard key", "---\nname: sample\ndescription: Guard\ndisable-model-invocation: true\ndisable-model-invocation: false\n---\n"],
  ["quoted name key", "---\n'name': sample\ndescription: Quoted key\n---\n"],
  ["quoted description key", "---\nname: sample\n\"description\": Quoted key\n---\n"],
  ["quoted guard key", "---\nname: sample\ndescription: Quoted guard\n\"disable-model-invocation\": true\n---\n"],
  ["merged anchored guard", "---\ndefaults: &guard\n  disable-model-invocation: true\n<<: *guard\nname: sample\ndescription: Merged guard\n---\n"],
  ["numeric name", "---\nname: 42\ndescription: Numeric\n---\n"],
  ["list description", "---\nname: sample\ndescription: [a, b]\n---\n"],
  ["mapping description", "---\nname: sample\ndescription: {a: b}\n---\n"],
  ["boolean description", "---\nname: sample\ndescription: false\n---\n"],
  ["empty description", "---\nname: sample\ndescription: ''\n---\n"],
  ["quoted boolean guard", "---\nname: sample\ndescription: Guard\ndisable-model-invocation: 'true'\n---\n"],
  ["invalid guard", "---\nname: sample\ndescription: Guard\ndisable-model-invocation: sometimes\n---\n"],
  ["leading sequence indicator description scalar", "---\nname: sample\ndescription: - text\n---\nBody\n"],
  ["bare sequence indicator description scalar", "---\nname: sample\ndescription: -\n---\nBody\n"],
  ["terminal colon description scalar", "---\nname: sample\ndescription: Example:\n---\nBody\n"],
  ["continued description scalar", "---\nname: sample\ndescription: First\n  second\n---\n"],
  ["NaN description scalar", "---\nname: sample\ndescription: .nan\n---\n"],
  ["infinite description scalar", "---\nname: sample\ndescription: .inf\n---\n"],
  ["multiline consumed scalar", "---\nname: sample\ndescription: |\n  ambiguous block\n---\n"],
  ["unclosed quote", "---\nname: sample\ndescription: 'broken\n---\n"],
  ["alias consumed scalar", "---\nname: sample\ndescription: *description\n---\n"],
  ["anchored consumed scalar", "---\nname: sample\ndescription: &description text\n---\n"],
] as const;

function invalidTree(f: Fixture, kind: string) {
  const base = join(f.checkout, "skills/sample");
  const external = join(f.root, "external");
  mkdirSync(external);
  if (kind === "root link") { renameSync(join(f.checkout, "skills"), join(external, "skills")); symlinkSync(join(external, "skills"), join(f.checkout, "skills")); }
  else if (kind === "immediate directory link") { renameSync(base, join(external, "sample")); symlinkSync(join(external, "sample"), base); }
  else if (kind === "skill file link") { renameSync(join(base, "SKILL.md"), join(external, "SKILL.md")); symlinkSync(join(external, "SKILL.md"), join(base, "SKILL.md")); }
  else if (kind === "nested directory link") symlinkSync(external, join(base, "references"));
  else if (kind === "nested file link") { write(join(external, "reference.md"), "Reference\n"); symlinkSync(join(external, "reference.md"), join(base, "reference.md")); }
  else write(join(base, kind, "SKILL.md"), "---\nname: nested\ndescription: Hidden\n---\n");
}
async function expectCatalogRejected(f: Fixture, diagnostic?: string) {
  const config: Config = { skills: { paths: ["existing"] }, command: { custom: { template: "unchanged" } } };
  const before = structuredClone(config);
  const error = await rejection(f, config);
  expect(error.length, "direct initialization must reject invalid checkout").toBeGreaterThan(0);
  if (diagnostic) expect(error).toContain(diagnostic);
  expect(config).toEqual(before);
  const installed = run(f, "install");
  expect(installed.status, installed.output).not.toBe(0);
  expect(installed.output.length).toBeGreaterThan(0);
  if (diagnostic) expect(installed.output).toContain(diagnostic);
  expect(state(f.config)).toEqual({ kind: "absent" });
}
// Offline model of native placeholder substitution and marker recognition only;
// marker contents are collected as strings, never executed or read.
function nativeExpansion(template: string, args: string) {
  const words = args.match(/(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/gi)?.map((arg) => arg.replace(/^["']|["']$/g, "")) ?? [];
  const placeholders = [...template.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
  const last = Math.max(0, ...placeholders);
  const positional = template.replace(/\$(\d+)/g, (_, n: string) => Number(n) === last ? words.slice(Number(n) - 1).join(" ") : words[Number(n) - 1] ?? "");
  const expanded = positional.replaceAll("$ARGUMENTS", args);
  return { expanded, shell: [...expanded.matchAll(/!`([^`]+)`/g)].map((m) => m[1]), files: [...expanded.matchAll(/(?<![\w`])@(\.?[^\s`,.]*(?:\.[^\s`,.]+)*)/g)].map((m) => m[1]) };
}
function catalogNames(f: Fixture) { return readdirSync(join(f.checkout, "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(); }
function assertCompleteCatalog(f: Fixture, config: Config) {
  const names = catalogNames(f);
  expect(Object.keys(config.command ?? {}).sort()).toEqual(names);
  names.forEach((name) => assertCanonicalCommand(f, config, name));
  const expected = names.filter((name) => !/^disable-model-invocation: true$/m.test(readFileSync(join(f.checkout, "skills", name, "SKILL.md"), "utf8").split("---")[1] ?? "")).map((name) => join(f.checkout, "skills", name));
  expect(config.skills?.paths).toEqual(expected);
}
function assertCanonicalCommand(f: Fixture, config: Config, name: string) {
  const command = config.command?.[name];
  const file = join(f.checkout, "skills", name, "SKILL.md");
  const body = readFileSync(file, "utf8").split(/^---\s*$/m).slice(2).join("---");
  expect(command, name).toBeDefined();
  expect(command!.template, name).toContain(file);
  expect(command!.template, name).toContain(dirname(file));
  expect(command!.template, name).toContain("$ARGUMENTS");
  expect(command!.template, name).not.toContain(body.trim());
  expect(command!.template, name).not.toContain("!`");
  expect(command!.model, name).toBeUndefined();
  expect(command!.agent, name).toBeUndefined();
}

describe("Canonical discovery preserves host configuration and rejects invalid catalogs.", () => {
  test("zero skills rejects initialization and registration", async () => { await expectCatalogRejected(make("empty", "empty")); });

  test("one skill registers its canonical directory and command", async () => {
    const f = make();
    const config = await load(f);
    expect(config.skills?.paths).toEqual([join(f.checkout, "skills/sample")]);
    expect(Object.keys(config.command ?? {})).toEqual(["sample"]);
    assertCanonicalCommand(f, config, "sample");
    expectStatus(run(f, "install"), 0);
  });

  test("the full real catalog registers every command and only unguarded paths", async () => {
    const f = make("complete", "full");
    const config = await load(f);
    assertCompleteCatalog(f, config);
    expect(config.command?.reflect?.description?.toLowerCase()).toContain("opencode");
    expect(config.command?.reflect?.description?.toLowerCase()).toMatch(/unsupported|not support|unavailable/);
    expectStatus(run(f, "install"), 0);
  });

  test("preserves existing settings and path order while deduplicating exact entries", async () => {
    const f = make();
    skill(f, "alpha");
    const existing: Config = { model: "local/model", provider: { local: { options: { baseURL: "http://invalid.local" } } }, agent: { review: { model: "local/reviewer" } }, plugin: ["user-plugin"], permission: { read: { "*": "deny", allowed: "allow" }, external_directory: "deny", skill: { "*": "ask" }, bash: "deny" }, custom: { untouched: true }, skills: { urls: ["https://invalid.local"], paths: ["z-existing", join(f.checkout, "skills/sample"), "a-existing", "z-existing"] }, command: { custom: { template: "User command", model: "local/custom" } } };
    const before = structuredClone(existing);
    await load(f, existing);
    expect(existing).toMatchObject({ model: before.model, provider: before.provider, agent: before.agent, plugin: before.plugin, permission: before.permission, custom: before.custom });
    expect(existing.command?.custom).toEqual(before.command?.custom);
    expect(existing.skills?.urls).toEqual(before.skills?.urls);
    expect(existing.skills?.paths).toEqual(["z-existing", join(f.checkout, "skills/sample"), "a-existing", join(f.checkout, "skills/alpha")]);
  });

  test("frontmatter guards determine discovery regardless of command name or user visibility", async () => {
    const f = make();
    skill(f, "sample", "name: sample\ndescription: Guarded sample\ndisable-model-invocation: true");
    skill(f, "reflect", "name: reflect\ndescription: Reflect fixture\ndisable-model-invocation: false");
    skill(f, "method", "name: method\ndescription: Internal methodology\nuser-invocable: false");
    const config = await load(f, { skills: { paths: [join(f.checkout, "skills/sample")] } });
    expect(Object.keys(config.command ?? {}).sort()).toEqual(["method", "reflect", "sample"]);
    expect(config.skills?.paths).toEqual([join(f.checkout, "skills/sample"), join(f.checkout, "skills/method"), join(f.checkout, "skills/reflect")]);
  });

  test.each([['single quotes', "'It''s a quoted: description'", "It's a quoted: description"], ['double quotes', '"A quoted: description"', "A quoted: description"]])("accepts %s and decodes the description", async (_, value, expected) => {
    const f = make();
    skill(f, "sample", `name: sample\ndescription: ${value}`);
    expect((await load(f)).command?.sample?.description).toBe(expected);
  });

  test.each(badHeaders)("rejects %s through both callers", async (_, content) => {
    const f = make();
    write(join(f.checkout, "skills/sample/SKILL.md"), content);
    await expectCatalogRejected(f, "SKILL.md");
  });

  test("a missing immediate skill file rejects both callers", async () => {
    const f = make();
    renameSync(join(f.checkout, "skills/sample/SKILL.md"), join(f.checkout, "skills/sample/README.md"));
    await expectCatalogRejected(f, "SKILL.md");
  });

  test("duplicate names diagnose both canonical files without partial contribution", async () => {
    const f = make();
    const duplicate = skill(f, "second", "name: sample\ndescription: Duplicate name");
    await expectCatalogRejected(f, "sample");
    const error = await rejection(f);
    expect(error).toContain(join(f.checkout, "skills/sample/SKILL.md"));
    expect(error).toContain(duplicate);
    expect(run(f, "install").output).toContain(duplicate);
  });

  test.each(["root link", "immediate directory link", "skill file link", "nested directory link", "nested file link", "references", "scripts/deep"])("rejects %s through both callers", async (kind) => {
    const f = make();
    invalidTree(f, kind);
    await expectCatalogRejected(f);
  });

  test("ordinary reference and script trees remain accessible", async () => {
    const f = make();
    write(join(f.checkout, "skills/sample/references/deep/reference.md"), "Literal reference\n");
    write(join(f.checkout, "skills/sample/scripts/example.sh"), "#!/bin/sh\nexit 0\n");
    const config = await load(f);
    expect(config.skills?.paths).toContain(join(f.checkout, "skills/sample"));
    expectStatus(run(f, "install"), 0);
    expect(readFileSync(join(f.checkout, "skills/sample/references/deep/reference.md"), "utf8")).toBe("Literal reference\n");
  });

  test.each(["$1", "$ARGUMENTS", "!`literal-command`", "@file"])("rejects checkout marker %s including a canonical alias", async (marker) => {
    const f = make(`unsafe-${marker}`);
    const alias = join(f.root, "safe-alias");
    symlinkSync(f.checkout, alias);
    await expectCatalogRejected(f, f.checkout);
    const config: Config = {};
    await expect(load(f, config, join(alias, "opencode/team.js"))).rejects.toThrow();
    expect(config).toEqual({});
  });

  test.each(["$1", "$ARGUMENTS", "!`literal-command`", "@file"])("rejects emitted skill path marker %s through both callers", async (marker) => {
    const f = make();
    renameSync(join(f.checkout, "skills/sample"), join(f.checkout, "skills", `sample-${marker}`));
    await expectCatalogRejected(f, marker);
  });

  test.each(["checkout with spaces", "équipe 日本語"])("preserves canonical paths in %s through native placeholder expansion", async (name) => {
    const f = make(name);
    const config = await load(f);
    const expanded = nativeExpansion(config.command!.sample!.template, "argument value");
    expect(expanded.expanded).toContain(join(f.checkout, "skills/sample/SKILL.md"));
    expect(expanded.shell).toEqual([]);
    expect(expanded.files).toEqual([]);
    expectStatus(run(f, "install"), 0);
  });

  test.each([
    ["skills", { skills: null }], ["skills", { skills: [] }], ["skills", { skills: "invalid" }],
    ["paths", { skills: { paths: "invalid" } }], ["paths", { skills: { paths: ["valid", 42] } }],
    ["paths", { skills: { paths: null } }], ["command", { command: null }], ["command", { command: [] }], ["command", { command: "invalid" }],
  ])("rejects wrong consumed %s type before mutation: %j", async (field, value) => {
    const f = make();
    const config = value as Config;
    const before = structuredClone(config);
    expect(await rejection(f, config)).toContain(field as string);
    expect(config).toEqual(before);
  });

  test.each(["alpha", "sample", "z-last"])("a collision at %s rejects the entire contribution", async (name) => {
    const f = make();
    skill(f, "alpha");
    skill(f, "z-last");
    const config: Config = { skills: { paths: ["keep"] }, command: { [name]: { template: "Existing command" } } };
    const before = structuredClone(config);
    expect(await rejection(f, config)).toContain(name);
    expect(config).toEqual(before);
  });

  test.each([["git-commit", ""], ["git-commit", "literal arguments"], ["team-design", ""], ["team-design", "literal arguments"]])("canonical %s body stays byte-for-byte unchanged with arguments %j", async (name, args) => {
    const f = make("real bodies", "empty");
    cpSync(join(REPO, "skills", name!), join(f.checkout, "skills", name!), { recursive: true });
    const file = join(f.checkout, "skills", name!, "SKILL.md");
    const before = readFileSync(file, "utf8");
    const config = await load(f);
    const expanded = nativeExpansion(config.command![name!]!.template, args!);
    expect(expanded.expanded).toContain(file);
    expect(expanded.shell).toEqual([]);
    expect(expanded.files).toEqual([]);
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(config.command![name!]!.template).not.toContain(before);
    expect(before).toContain(name === "git-commit" ? "!`" : "$ARGUMENTS");
  });

  test("native argument markers remain detectable without processing canonical content", async () => {
    const f = make();
    const config = await load(f);
    const positive = nativeExpansion("$ARGUMENTS", "!`printf literal` @fixture $1");
    const actual = nativeExpansion(config.command!.sample!.template, "!`printf literal` @fixture $1");
    expect(positive.shell).toEqual(["printf literal"]);
    expect(positive.files).toEqual(["fixture"]);
    expect(actual.shell).toEqual(positive.shell);
    expect(actual.files).toEqual(positive.files);
    expect(actual.expanded).toContain("$1");
    expect(actual.expanded).toContain(join(f.checkout, "skills/sample/SKILL.md"));
  });
});
