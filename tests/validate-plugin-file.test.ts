import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dir, "..");
const WORK = mkdtempSync(join(tmpdir(), `team-validate-${process.pid}-`));
afterAll(() => rmSync(WORK, { recursive: true, force: true }));

function write(relativePath: string, content: string) {
  const absolutePath = join(WORK, relativePath);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, content);
  return absolutePath;
}

const VALID_SKILL = "---\nname: sample\ndescription: A sample\n---\n# Body\n";
const VALID_AGENT = "---\nname: sample\ndescription: A sample\n---\nBody\n";

describe("validatePluginFile", () => {
  // @ts-expect-error The shared validator is JavaScript without declarations.
  const load = () => import(pathToFileURL(join(ROOT, "hooks/lib/validate-plugin-file.mjs")).href);

  test("exports PLUGIN_DIRS", async () => {
    const { PLUGIN_DIRS } = await load();
    expect(PLUGIN_DIRS).toEqual(["agents/", "skills/", "hooks/", ".claude-plugin/"]);
  });

  test("returns an empty list for a valid plugin tree", async () => {
    const { validatePluginFile } = await load();
    const absolute = write("skills/ok/SKILL.md", VALID_SKILL);
    expect(await validatePluginFile("skills/ok/SKILL.md", absolute)).toEqual([]);
    const agent = write("agents/ok.md", VALID_AGENT);
    expect(await validatePluginFile("agents/ok.md", agent)).toEqual([]);
    const json = write(".claude-plugin/ok.json", '{"name":"team"}\n');
    expect(await validatePluginFile(".claude-plugin/ok.json", json)).toEqual([]);
    const hook = write("hooks/ok.mjs", "export const ok = true;\n");
    expect(await validatePluginFile("hooks/ok.mjs", hook)).toEqual([]);
  });

  test("returns a reason for an agent without frontmatter", async () => {
    const { validatePluginFile } = await load();
    const absolute = write("agents/bad.md", "# no frontmatter\n");
    const reasons = await validatePluginFile("agents/bad.md", absolute);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons[0]).toContain("YAML frontmatter");
  });

  test("returns a reason for a SKILL.md without frontmatter", async () => {
    const { validatePluginFile } = await load();
    const absolute = write("skills/bad/SKILL.md", "# no frontmatter\n");
    const reasons = await validatePluginFile("skills/bad/SKILL.md", absolute);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons[0]).toContain("SKILL.md must start with YAML frontmatter");
  });

  test("returns a reason for invalid JSON", async () => {
    const { validatePluginFile } = await load();
    const absolute = write(".claude-plugin/bad.json", "{not json");
    const reasons = await validatePluginFile(".claude-plugin/bad.json", absolute);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons[0]).toContain("Invalid JSON");
  });

  test("returns a reason for invalid hook syntax", async () => {
    const { validatePluginFile } = await load();
    const absolute = write("hooks/bad.mjs", "export const = ;\n");
    const reasons = await validatePluginFile("hooks/bad.mjs", absolute);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons[0]).toContain("Syntax error");
  });

  test("ignores files outside the plugin directories", async () => {
    const { validatePluginFile } = await load();
    const absolute = write("docs/notes.md", "# no frontmatter\n");
    expect(await validatePluginFile("docs/notes.md", absolute)).toEqual([]);
  });
});

describe("Claude post-write-validate subprocess", () => {
  function run(filePath: string) {
    return spawnSync("node", [join(ROOT, "hooks/post-write-validate.mjs")], {
      cwd: WORK,
      env: { ...process.env, CLAUDE_PROJECT_DIR: WORK },
      input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: filePath } }),
      encoding: "utf8",
    });
  }

  test("blocks a malformed SKILL.md with exit 1 and a BLOCKED reason", () => {
    const filePath = write("skills/broken/SKILL.md", "# no frontmatter\n");
    const result = run(filePath);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("BLOCKED:");
    expect(result.stderr).toContain("skills/broken/SKILL.md");
    expect(result.stderr).toContain("SKILL.md must start with YAML frontmatter");
  });

  test("exits 0 for a valid plugin file", () => {
    const filePath = write("skills/valid/SKILL.md", VALID_SKILL);
    const result = run(filePath);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("ignores a non-plugin file", () => {
    const filePath = write("notes.txt", "anything\n");
    const result = run(filePath);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
