import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import contract from "./fixtures/principle-resources.json";
import { loadInstructionContext } from "./helpers/fixtures";
import { fixture, load, type Fixture } from "./helpers/opencode";
import { loadedSkills, skillNames } from "./helpers/skill-refs";

const ROOT = resolve(import.meta.dir, "..");
const PRINCIPLES = [
  "durable-state.md", "focused-work.md", "human-control.md",
  "independent-review.md", "verified-results.md",
];
const RESOURCES = [...new Set(contract.dispositions.map(({ destination }) => destination))];
const fixtures: Fixture[] = [];

afterEach(() => {
  for (const item of fixtures.splice(0)) item.dispose();
});

function readOrEmpty(path: string): string {
  return existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), "utf8") : "";
}

function linkedPaths(
  path: string,
  text: string,
  base = path.startsWith("skills/") ? path.split("/").slice(0, 2).join("/") : dirname(path),
): string[] {
  return [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => {
    const target = match[1]!.split("#")[0]!;
    return relative(ROOT, resolve(ROOT, target.startsWith("skills/") ? "" : base, target));
  });
}

function dispositionRows(name: string, destination: string): string[] {
  return readOrEmpty("docs/migration-contract.md").split("\n")
    .filter((row) => row.includes(`\`${name}\``) && row.includes(destination));
}

function retiredIdentifiers(source: string): string[] {
  return source.match(/\bprinciple-[a-z-]+\b/g) ?? [];
}

function principleFiles(): string[] {
  const path = join(ROOT, "skills/team/principles");
  return existsSync(path) ? readdirSync(path).sort() : [];
}

function installation(): Fixture & { installed: string } {
  const item = fixture("principle source", "full");
  fixtures.push(item);
  const installed = join(item.home, "plugins/team");
  mkdirSync(installed, { recursive: true });
  cpSync(join(item.checkout, "skills"), join(installed, "skills"), { recursive: true });
  cpSync(join(item.checkout, "opencode"), join(installed, "opencode"), { recursive: true });
  return { ...item, installed };
}

describe("Principle disposition", () => {
  test("installed fixture catalog discovery retains exactly 47 registrations", async () => {
    const item = installation();
    const config = await load(item, {}, join(item.installed, "opencode/team.js"));

    expect([...skillNames(item.installed)]).toHaveLength(47);
    expect([...skillNames(item.installed)].sort()).toEqual(contract.registrations);
    expect(Object.keys(config.command ?? {})).toHaveLength(47);
    expect(config.command?.team).toBeDefined();
  });

  test("exactly five ordinary principle documents remain", () => {
    expect(principleFiles()).toEqual(PRINCIPLES);
  });

  test.each(contract.dispositions)("$name records its destination", ({ name, destination }) => {
    expect(dispositionRows(name, destination), name).not.toEqual([]);
  });

  test.each(contract.dispositions)("$name has no runtime registration", ({ name }) => {
    expect(skillNames(ROOT).has("team")).toBe(true);
    expect(skillNames(ROOT).has(name)).toBe(false);
  });

  test.each(contract.callers.flatMap(({ path, destinations }) =>
    destinations.map((destination) => ({ path, destination })),
  ))("$path delivers $destination", ({ path, destination }) => {
    expect(linkedPaths(path, readOrEmpty(path)), path).toContain(destination);
    expect(existsSync(join(ROOT, destination)), destination).toBe(true);
  });

  test.each(contract.callers)("$path has no retired runtime identifier", ({ path }) => {
    const source = readOrEmpty(path);
    expect(source.length, path).toBeGreaterThan(0);
    expect(retiredIdentifiers(source), path).toEqual([]);
  });

  test.each(RESOURCES)("%s has no retired runtime identifier", (path) => {
    const source = readOrEmpty(path);

    expect(source.length, path).toBeGreaterThan(0);
    expect(retiredIdentifiers(source), path).toEqual([]);
  });

  test.each(RESOURCES)("%s is readable outside the checkout after source removal", async (path) => {
    const item = installation();
    expect(existsSync(join(item.installed, path)), path).toBe(true);
    const expected = loadInstructionContext([path], item.checkout);
    rmSync(item.checkout, { recursive: true });
    const config = await load(item, {}, join(item.installed, "opencode/team.js"));

    expect(existsSync(item.checkout)).toBe(false);
    expect(config.command?.team?.template).toContain(item.installed);
    expect(loadInstructionContext([path], item.installed)).toBe(expected);
  });

  test.each(RESOURCES)("missing installed %s fails while its source remains readable", (path) => {
    const item = installation();
    expect(existsSync(join(item.installed, path)), path).toBe(true);
    expect(loadInstructionContext([path], item.installed)).toBe(loadInstructionContext([path], item.checkout));
    rmSync(join(item.installed, path));

    expect(loadInstructionContext([path], item.checkout).length).toBeGreaterThan(0);
    expect(() => loadInstructionContext([path], item.installed)).toThrow(join(item.installed, path));
  });
});

describe("Existing guards: resource controls", () => {
  test("nested skill references resolve from the loaded skill directory", () => {
    const path = "skills/pr-verify/references/04-execution.md";

    expect(linkedPaths(path, readOrEmpty(path)))
      .toContain("skills/team/references/15-host-dispatch.md");
    expect(existsSync(join(ROOT, "skills/team/references/15-host-dispatch.md"))).toBe(true);
  });

  test("the link check resolves both installed relative and repository paths", () => {
    expect(linkedPaths("agents/researcher.md", "Read [execution](../skills/team/references/execution.md)."))
      .toEqual(["skills/team/references/execution.md"]);
    expect(linkedPaths("skills/team/SKILL.md", "Read [control](principles/human-control.md)."))
      .toEqual(["skills/team/principles/human-control.md"]);
    expect(linkedPaths("skills/pr-verify/references/04-execution.md", "Read [dispatch](skills/team/references/15-host-dispatch.md)."))
      .toEqual(["skills/team/references/15-host-dispatch.md"]);
  });

  test("resource-local template links use their explicitly supplied base", () => {
    expect(linkedPaths("skills/team/references/artifacts.md", "Read the local [template](templates/task.md).", "skills/team/references"))
      .toEqual(["skills/team/references/templates/task.md"]);
  });

  test("nested skill references do not gain another parent traversal", () => {
    expect(linkedPaths("skills/pr-verify/references/04-execution.md", "Read [dispatch](../../team/references/15-host-dispatch.md)."))
      .toEqual(["team/references/15-host-dispatch.md"]);
  });

  test("the load scanner detects a retired name across line breaks", () => {
    expect(loadedSkills("Call the Skill tool with\n`principle-progress-tracking`."))
      .toEqual(["principle-progress-tracking"]);
    expect(retiredIdentifiers("skills:\n  - principle-progress-tracking\n"))
      .toEqual(["principle-progress-tracking"]);
  });
});
