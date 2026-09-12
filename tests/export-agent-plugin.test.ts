import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { loadedSkills, skillNames } from "./helpers/skill-refs";

const ROOT = realpathSync(join(import.meta.dir, ".."));
const EXPORTER = join(ROOT, "scripts/export-agent-plugin.ts");
const SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const SHIPIT_URL = "https://github.com/bostonaholic/team/blob/main/docs/versioning.md";
const PORTABLE_FIELDS = ["allowed-tools", "compatibility", "description", "license", "metadata", "name"];
const temporaryDirectories: string[] = [];

afterAll(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

type Exporter = {
  exportPlugin(sourceRoot: string, destination: string): Promise<{ destination: string; omitted: string[] }>;
  validateManifest(text: string, path: string): Record<string, unknown>;
  projectSkill(text: string, directoryName: string, path: string): {
    metadata: Record<string, unknown>; body: string; content: string; eligible: boolean;
  };
};

const exporter: Exporter | null = existsSync(EXPORTER)
  ? await import(pathToFileURL(EXPORTER).href) as Exporter
  : null;

function requireExporter(): Exporter {
  expect(existsSync(EXPORTER), "export CLI exists").toBe(true);
  expect(typeof exporter?.exportPlugin, "explicit export operation exists").toBe("function");
  return exporter!;
}

function temporaryDirectory(): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), `agent-plugin-${process.pid}-`)));
  temporaryDirectories.push(directory);
  return directory;
}

function write(root: string, path: string, content: string | Buffer): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function fixture(): { parent: string; source: string; destination: string } {
  const parent = temporaryDirectory();
  const source = join(parent, "source");
  write(source, "plugin.json", JSON.stringify({ $schema: SCHEMA, name: "team", version: "0.96.0" }));
  write(source, "LICENSE", "MIT fixture license\n");
  write(source, "docs/agent-plugins.md", "# Portable fixture\n\n[Documentation](https://example.com/docs)\n");
  write(source, "skills/alpha/SKILL.md", "---\nname: alpha\ndescription: Fixture skill\nuser-invocable: false\n---\n\n# Alpha\n\n[Notes](references/notes.md?view=plain#usage)\n");
  write(source, "skills/alpha/references/notes.md", "# Notes\n\nUse the fixture.\n");
  write(source, "skills/alpha/agents/openai.yaml", "interface:\n  display_name: Alpha\n");
  mkdirSync(join(source, "scripts"));
  symlinkSync(join(ROOT, "node_modules"), join(source, "node_modules"));
  if (existsSync(EXPORTER)) copyFileSync(EXPORTER, join(source, "scripts/export-agent-plugin.ts"));
  return { parent, source, destination: join(parent, "export") };
}

function file(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function paths(root: string, prefix = ""): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(prefix, entry.name);
    return entry.isDirectory() ? [path, ...paths(join(root, entry.name), path)] : [path];
  }).sort();
}

function snapshot(root: string) {
  return paths(root).map((path) => {
    const absolute = join(root, path);
    const stat = lstatSync(absolute);
    return {
      path,
      kind: stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "symlink" : "file",
      executable: stat.mode & 0o111,
      bytes: stat.isFile() ? readFileSync(absolute).toString("base64") : "",
      target: stat.isSymbolicLink() ? readlinkSync(absolute) : "",
    };
  });
}

function splitSkill(text: string): { metadata: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/.exec(text);
  expect(match, "skill has delimited YAML frontmatter").not.toBeNull();
  return {
    metadata: Bun.YAML.parse(match![1]!) as Record<string, unknown>,
    body: text.slice(match![0].length),
  };
}

function sourceInventory(source: string) {
  const names = [...skillNames(source)].sort();
  const omitted = names.filter((name) => splitSkill(file(join(source, "skills", name, "SKILL.md"))).metadata["disable-model-invocation"] === true);
  return { names: names.filter((name) => !omitted.includes(name)), omitted };
}

function markdownDestinations(text: string): string[] {
  const destinations: string[] = [];
  new HTMLRewriter()
    .on("a[href], img[src]", {
      element(element) {
        const target = element.getAttribute(element.tagName === "a" ? "href" : "src");
        if (target !== null) destinations.push(target);
      },
    })
    .transform(Bun.markdown.html(text));
  return destinations.filter((target) => !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target));
}

function linkProblems(root: string): string[] {
  const problems: string[] = [];
  for (const path of paths(join(root, "skills")).filter((path) => path.endsWith(".md"))) {
    const containingFile = join(root, "skills", path);
    for (const destination of markdownDestinations(markdownSource(root, path))) {
      const target = resolve(dirname(containingFile), decodeURIComponent(destination.split(/[?#]/)[0]!));
      const fromRoot = relative(root, target);
      if (isAbsolute(fromRoot) || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || !existsSync(target)) {
        problems.push(`${path}: ${destination}`);
      }
    }
  }
  return problems.sort();
}

function missingLoads(root: string): string[] {
  const inventory = skillNames(root);
  return paths(join(root, "skills")).filter((path) => path.endsWith(".md"))
    .flatMap((path) => loadedSkills(markdownSource(root, path))
      .filter((name) => !inventory.has(name)).map((name) => `${path}: ${name}`)).sort();
}

function markdownSource(root: string, path: string): string {
  const text = file(join(root, "skills", path));
  return path.split(sep).length === 2 && basename(path) === "SKILL.md" ? splitSkill(text).body : text;
}

async function cli(source: string, args: string[], cwd: string, preload?: string) {
  requireExporter();
  const command = [process.execPath, "--no-install", ...(preload ? ["--preload", preload] : []), join(source, "scripts/export-agent-plugin.ts"), ...args];
  const child = Bun.spawn(command, { cwd, env: { ...process.env, TZ: "UTC", LANG: "C" }, stdout: "pipe", stderr: "pipe" });
  const [status, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ]);
  return { status, stdout, stderr, output: stdout + stderr };
}

function expectSuccess(result: { status: number; output: string }): void {
  expect(result, "CLI reports successful completed export").toMatchObject({ status: 0 });
}

function expectRefusal(result: { status: number; output: string }, diagnostic: RegExp | string): void {
  expect(result, "CLI refuses invalid export").not.toMatchObject({ status: 0 });
  if (typeof diagnostic === "string") expect(result.output).toContain(diagnostic);
  else expect(result.output).toMatch(diagnostic);
}

async function preflight(source: string, destination: string, parent: string) {
  const preload = faultPreload(parent, destination, "observe-create");
  const result = await cli(source, [destination], parent, preload);
  return { ...result, destinationCreated: existsSync(join(parent, "fault-observed")) };
}

// Faults apply only to this child's disposable destination. Real filesystem
// methods serve every other operation, including all source reads.
function faultPreload(parent: string, destination: string, fault: string): string {
  const preload = join(parent, `fault-${fault}.ts`);
  writeFileSync(preload, `
import { mock } from "bun:test";
import fs from "node:fs";
import promises from "node:fs/promises";
import { join, resolve, relative, sep } from "node:path";
const destination = ${JSON.stringify(destination)};
const fault = ${JSON.stringify(fault)};
const marker = ${JSON.stringify(join(parent, "fault-observed"))};
const rawWrite = fs.writeFileSync.bind(fs);
const rawExists = fs.existsSync.bind(fs);
const writeTargets = new Set(["copyFile", "cp"]);
function wrapped(name, original, asynchronous) {
  return function (...args) {
    const base = name.replace(/Sync$/, "");
    const target = String(args[writeTargets.has(base) ? 1 : 0]);
    const path = resolve(target);
    const child = relative(destination, path);
    const inside = path === destination || (child !== ".." && !child.startsWith(".." + sep) && !child.startsWith(sep));
    let code = "";
    if (fault === "observe-create" && base === "mkdir" && path === destination) rawWrite(marker, "created");
    if (fault === "mkdir" && base === "mkdir" && path === destination) code = "EACCES";
    if (inside && ["writeFile", "copyFile", "cp"].includes(base) && rawExists(destination)) {
      if (["copy", "cleanup"].includes(fault)) code = "EIO";
      if (fault === "disk-full") code = "ENOSPC";
    }
    if (fault === "cleanup" && ["rm", "rmdir", "unlink"].includes(base) && inside) code = "EACCES";
    if (code) {
      rawWrite(marker, code);
      const error = Object.assign(new Error(code + ": " + base + " " + path), { code, syscall: base, path });
      if (asynchronous) return Promise.reject(error);
      throw error;
    }
    const result = original(...args);
    if (fault === "corrupt" && inside && ["writeFile", "copyFile", "cp"].includes(base) && path.endsWith("SKILL.md")) {
      const corrupt = () => { rawWrite(path, "---\\nname: []\\n---\\ncorrupt\\n"); rawWrite(marker, "corrupt"); };
      if (asynchronous) return Promise.resolve(result).then(value => { corrupt(); return value; });
      corrupt();
    }
    return result;
  };
}
const sync = { ...fs };
const async = { ...promises };
for (const name of ["mkdir", "writeFile", "copyFile", "cp", "rm", "rmdir", "unlink"]) {
  if (typeof fs[name + "Sync"] === "function") sync[name + "Sync"] = wrapped(name + "Sync", fs[name + "Sync"].bind(fs), false);
  if (typeof promises[name] === "function") async[name] = wrapped(name, promises[name].bind(promises), true);
}
sync.promises = async;
mock.module("node:fs", () => ({ ...sync, default: sync }));
mock.module("node:fs/promises", () => ({ ...async, default: async }));
`);
  return preload;
}

describe("Fresh exports preserve package integrity and ownership", () => {
  test("real checkout produces validated required files and reports destination and omissions", async () => {
    const api = requireExporter();
    const destination = join(temporaryDirectory(), "team");
    const result = await api.exportPlugin(ROOT, destination);

    expect(result.destination).toBe(destination);
    expect(result.omitted.sort()).toEqual(sourceInventory(ROOT).omitted);
    expect(readdirSync(destination).sort()).toEqual(["LICENSE", "README.md", "plugin.json", "skills"]);
    expect(api.validateManifest(file(join(destination, "plugin.json")), join(destination, "plugin.json"))).toEqual(JSON.parse(file(join(ROOT, "plugin.json"))));
    expect(file(join(destination, "LICENSE"))).toBe(file(join(ROOT, "LICENSE")));
    expect(file(join(destination, "README.md"))).toBe(file(join(ROOT, "docs/agent-plugins.md")));
    expect([...skillNames(destination)].sort()).toEqual(sourceInventory(ROOT).names);
    expect(exportedMetadataProblems(api, destination)).toEqual([]);
  });

  test("one-skill source exports from another working directory and reports its destination", async () => {
    const { source, parent, destination } = fixture();
    const result = await cli(source, [destination], parent);

    expectSuccess(result);
    expect(result.output).toContain(destination);
    expect([...skillNames(destination)]).toEqual(["alpha"]);
    expect(linkProblems(destination)).toEqual([]);
    expect(splitSkill(file(join(destination, "skills/alpha/SKILL.md"))).metadata).toEqual({ name: "alpha", description: "Fixture skill" });
  });

  test.each(["missing", "empty"])("%s source skills tree fails before destination creation", async (state) => {
    const { source, parent, destination } = fixture();
    removeSkills(source, state);
    const result = await preflight(source, destination, parent);

    expectRefusal(result, /skills/i);
    expect(result.destinationCreated).toBe(false);
    expect(existsSync(destination)).toBe(false);
  });

  test.each([0, 2])("%i destination arguments report usage without output", async (count) => {
    const { source, parent, destination } = fixture();
    const result = await cli(source, Array(count).fill(destination), parent);

    expectRefusal(result, /usage|exactly one|one.*destination/i);
    expect(existsSync(destination)).toBe(false);
  });

  test("relative destination is refused", async () => {
    const { source, parent } = fixture();
    const result = await cli(source, ["relative-output"], parent);

    expectRefusal(result, /absolute/i);
    expect(existsSync(join(parent, "relative-output"))).toBe(false);
  });

  test("destination inside source is refused without source mutation", async () => {
    const { source, parent } = fixture();
    const before = snapshot(source);
    const result = await cli(source, [join(source, "output")], parent);

    expectRefusal(result, /outside|within|inside|contain/i);
    expect(snapshot(source)).toEqual(before);
  });

  test("symlinked parent cannot disguise destination inside source", async () => {
    const { source, parent } = fixture();
    symlinkSync(source, join(parent, "alias"));
    const result = await cli(source, [join(parent, "alias/output")], parent);

    expectRefusal(result, /outside|within|inside|contain/i);
    expect(existsSync(join(source, "output"))).toBe(false);
  });

  test("missing destination parent is refused without creating parents", async () => {
    const { source, parent } = fixture();
    const result = await cli(source, [join(parent, "missing/output")], parent);

    expectRefusal(result, join(parent, "missing"));
    expect(existsSync(join(parent, "missing"))).toBe(false);
  });

  test.each(["directory", "file", "live symlink", "dangling symlink"])("existing %s survives refusal byte-for-byte", async (kind) => {
    const { source, parent, destination } = fixture();
    existingDestination(parent, destination, kind);
    const before = snapshot(parent);
    const result = await cli(source, [destination], parent);

    expectRefusal(result, /exist/i);
    expect(result.output).toMatch(/fresh|new directory|different directory/i);
    expect(snapshot(parent)).toEqual(before);
  });

  test("simultaneous exporters have one owner and the loser preserves completed output", async () => {
    const { source, parent, destination } = fixture();
    const results = await Promise.all([cli(source, [destination], parent), cli(source, [destination], parent)]);

    expect(results.filter((result) => result.status === 0)).toHaveLength(1);
    expect(results.filter((result) => result.status !== 0)).toHaveLength(1);
    expect(file(join(destination, "LICENSE"))).toBe("MIT fixture license\n");
    expect([...skillNames(destination)]).toEqual(["alpha"]);
    expect(linkProblems(destination)).toEqual([]);
  });

  test("late invalid skill aborts before destination creation", async () => {
    const { source, parent, destination } = fixture();
    write(source, "skills/zz-invalid/SKILL.md", "---\nname: zz-invalid\ndescription: 42\n---\n\nInvalid.\n");
    const result = await preflight(source, destination, parent);

    expectRefusal(result, "skills/zz-invalid/SKILL.md");
    expect(result.output).toMatch(/description/i);
    expect(result.destinationCreated).toBe(false);
    expect(existsSync(destination)).toBe(false);
  });

  test("source MCP configuration requires an audit before export", async () => {
    const { source, parent, destination } = fixture();
    write(source, "mcp.json", '{"mcpServers":{}}\n');
    const result = await preflight(source, destination, parent);

    expectRefusal(result, "mcp.json");
    expect(result.output).toMatch(/audit|profile|unsupported/i);
    expect(result.destinationCreated).toBe(false);
    expect(existsSync(destination)).toBe(false);
  });

  test("directory-only client extension requires an audit before destination creation", async () => {
    const { source, parent, destination } = fixture();
    write(source, "com.example.client/hooks/hooks.json", '{"hooks":{}}\n');
    expect(JSON.parse(file(join(source, "plugin.json"))).extensions).toBeUndefined();
    const result = await preflight(source, destination, parent);

    expectRefusal(result, "com.example.client");
    expect(result.output).toMatch(/audit/i);
    expect(result.destinationCreated).toBe(false);
    expect(existsSync(destination)).toBe(false);
  });

  test("whitespace-only description aborts before destination creation", async () => {
    const { source, parent, destination } = fixture();
    write(source, "skills/alpha/SKILL.md", "---\nname: alpha\ndescription: '   '\n---\n\n# Alpha\n");
    const result = await preflight(source, destination, parent);

    expectRefusal(result, "skills/alpha/SKILL.md");
    expect(result.output).toMatch(/description/i);
    expect(result.destinationCreated).toBe(false);
    expect(existsSync(destination)).toBe(false);
  });

  test.each(["LICENSE", "docs/agent-plugins.md", "skills/alpha/references/notes.md"])("missing required resource %s aborts before creation", async (path) => {
    const { source, parent, destination } = fixture();
    rmSync(join(source, path));
    const result = await preflight(source, destination, parent);

    expectRefusal(result, basename(path));
    expect(result.destinationCreated).toBe(false);
    expect(existsSync(destination)).toBe(false);
  });

  test("unexpected native registration content is not silently omitted", async () => {
    const { source, parent, destination } = fixture();
    write(source, "skills/alpha/agents/other.yaml", "unexpected: true\n");
    const result = await preflight(source, destination, parent);

    expectRefusal(result, "skills/alpha/agents/other.yaml");
    expect(result.destinationCreated).toBe(false);
    expect(existsSync(destination)).toBe(false);
  });

  test.each(["skills/alpha/references/linked.md", "skills/alpha/agents/openai.yaml", "LICENSE"])("symlink input %s is refused without following it", async (path) => {
    const { source, parent, destination } = fixture();
    write(parent, "outside.txt", "outside remains unchanged\n");
    rmSync(join(source, path), { force: true });
    symlinkSync(join(parent, "outside.txt"), join(source, path));
    const result = await preflight(source, destination, parent);

    expectRefusal(result, path);
    expect(result.output).toMatch(/symlink|symbolic/i);
    expect(result.destinationCreated).toBe(false);
    expect(existsSync(destination)).toBe(false);
    expect(file(join(parent, "outside.txt"))).toBe("outside remains unchanged\n");
  });

  test("special-file input is refused before copying", async () => {
    const { source, parent, destination } = fixture();
    const created = spawnSync("mkfifo", [join(source, "skills/alpha/references/pipe")], { encoding: "utf8" });
    expect({ status: created.status, stderr: created.stderr }).toMatchObject({ status: 0 });
    const result = await preflight(source, destination, parent);

    expectRefusal(result, "skills/alpha/references/pipe");
    expect(result.output).toMatch(/special|regular|unsupported/i);
    expect(result.destinationCreated).toBe(false);
    expect(existsSync(destination)).toBe(false);
  });

  test("unwritable destination reports failed creation without output", async () => {
    const { source, parent, destination } = fixture();
    const preload = faultPreload(parent, destination, "mkdir");
    const result = await cli(source, [destination], parent, preload);

    expect(file(join(parent, "fault-observed"))).toBe("EACCES");
    expectRefusal(result, /mkdir|creat/i);
    expect(result.output).toContain(destination);
    expect(existsSync(destination)).toBe(false);
  });

  test.each(["copy", "disk-full"])("post-creation %s failure removes only owned incomplete output", async (fault) => {
    const { source, parent, destination } = fixture();
    write(parent, "unrelated/keep.txt", "keep\n");
    const before = snapshot(source);
    const preload = faultPreload(parent, destination, fault);
    const result = await cli(source, [destination], parent, preload);

    expect(file(join(parent, "fault-observed"))).toMatch(/EIO|ENOSPC/);
    expectRefusal(result, /EIO|ENOSPC/);
    expect(result.output).toMatch(/copy|write/i);
    expect(existsSync(destination)).toBe(false);
    expect(file(join(parent, "unrelated/keep.txt"))).toBe("keep\n");
    expect(snapshot(source)).toEqual(before);
  });

  test("cleanup failure reports both write and removal errors without success", async () => {
    const { source, parent, destination } = fixture();
    const preload = faultPreload(parent, destination, "cleanup");
    const result = await cli(source, [destination], parent, preload);

    expect(file(join(parent, "fault-observed"))).toBe("EACCES");
    expectRefusal(result, /EIO/);
    expect(result.output).toMatch(/EACCES/);
    expect(result.output).toMatch(/clean|remov|\brm\b/i);
    expect(existsSync(destination)).toBe(true);
  });

  test("final output corruption fails validation and removes owned output", async () => {
    const { source, parent, destination } = fixture();
    const preload = faultPreload(parent, destination, "corrupt");
    const result = await cli(source, [destination], parent, preload);

    expect(file(join(parent, "fault-observed"))).toBe("corrupt");
    expectRefusal(result, /SKILL\.md/);
    expect(existsSync(destination)).toBe(false);
  });

  test("interrupted output and reruns are refused with fresh-directory advice", async () => {
    const { source, parent, destination } = fixture();
    write(destination, "skills/alpha/SKILL.md", "partial export\n");
    const before = snapshot(destination);
    const first = await cli(source, [destination], parent);
    const second = await cli(source, [destination], parent);

    expectRefusal(first, /fresh|new directory|different directory/i);
    expectRefusal(second, /fresh|new directory|different directory/i);
    expect(snapshot(destination)).toEqual(before);
  });

  test("two fresh stable exports preserve paths bytes executable bits and source", async () => {
    const api = requireExporter();
    const { source, parent, destination } = fixture();
    write(source, "skills/alpha/scripts/helper.sh", "#!/bin/sh\nprintf 'fixture\\n'\n");
    chmodSync(join(source, "skills/alpha/scripts/helper.sh"), 0o751);
    const before = snapshot(source);
    await api.exportPlugin(source, destination);
    await api.exportPlugin(source, join(parent, "second"));

    expect(snapshot(destination)).toEqual(snapshot(join(parent, "second")));
    expect(snapshot(source)).toEqual(before);
    expect(lstatSync(join(destination, "skills/alpha/scripts/helper.sh")).mode & 0o111).toBe(0o111);
    expect(file(join(destination, "skills/alpha/scripts/helper.sh"))).toBe(file(join(source, "skills/alpha/scripts/helper.sh")));
  });

  test("guarded skill discovery is omitted while its resources and omission report remain", async () => {
    const { source, parent, destination } = fixture();
    write(source, "skills/guarded/SKILL.md", "---\nname: guarded\ndescription: Explicit invocation only\ndisable-model-invocation: true\n---\n\nGuarded instructions.\n");
    write(source, "skills/guarded/references/shared.md", "# Shared resource\n");
    const result = await cli(source, [destination], parent);

    expectSuccess(result);
    expect(result.output).toContain("guarded");
    expect([...skillNames(destination)]).toEqual(["alpha"]);
    expect(existsSync(join(destination, "skills/guarded/SKILL.md"))).toBe(false);
    expect(file(join(destination, "skills/guarded/references/shared.md"))).toBe("# Shared resource\n");
  });

  test("real export preserves every body resource and mode while omitting native discovery and registration", async () => {
    const api = requireExporter();
    const destination = join(temporaryDirectory(), "team");
    const before = snapshot(join(ROOT, "skills"));
    await api.exportPlugin(ROOT, destination);

    expect(packageDifferences(ROOT, destination)).toEqual([]);
    expect(snapshot(join(ROOT, "skills"))).toEqual(before);
    expect(paths(destination).filter((path) => /(?:^|\/)(?:agents|hooks|\.claude-plugin|\.codex-plugin|\.agents)(?:\/|$)/.test(path))).toEqual([]);
    expect(file(join(destination, "skills/team/registry.json"))).toBe(file(join(ROOT, "skills/team/registry.json")));
    expect(file(join(destination, "skills/pr-watch-as-reviewer/references/02-input.md"))).toBe(file(join(ROOT, "skills/pr-watch-as-reviewer/references/02-input.md")));
    expect(file(join(destination, "skills/pr-screenshots/references/01-input-and-result.md"))).toContain("skills/pr-watch-as-reviewer/references/02-input.md");
  });

  test("real exported skill loads and Markdown file links resolve within the package", async () => {
    const api = requireExporter();
    const destination = join(temporaryDirectory(), "team");
    await api.exportPlugin(ROOT, destination);

    expect([...skillNames(destination)].length).toBeGreaterThan(0);
    expect(missingLoads(destination)).toEqual([]);
    expect(linkProblems(destination)).toEqual([]);
    expect(file(join(ROOT, "skills/shipit/SKILL.md"))).toContain(SHIPIT_URL);
    expect(file(join(destination, "skills/shipit/SKILL.md"))).toContain(SHIPIT_URL);
  });

  test.each([
    ["original shipit", "../../docs/versioning.md"],
    ["missing target", "references/missing.md#part"],
    ["escaping target", "../../../outside.md?raw=1#part"],
  ])("%s Markdown link is rejected before output creation", async (_label, target) => {
    const { source, parent, destination } = fixture();
    write(parent, "outside.md", "outside package\n");
    writeBrokenLink(source, target);
    const result = await preflight(source, destination, parent);

    expect(linkProblems(source)).toHaveLength(1);
    expectRefusal(result, /SKILL\.md/);
    expect(result.destinationCreated).toBe(false);
    expect(existsSync(destination)).toBe(false);
  });

  test("retained local links resolve while fenced examples and external URLs are ignored", async () => {
    const { source, parent, destination } = fixture();
    write(source, "skills/alpha/references/notes.md", "# Notes\n\n[Self](notes.md?plain=1#notes)\n\n[External](https://example.invalid/missing)\n\n```md\n[Example](missing.md)\n```\n\n~~~markdown\n[Another example](also-missing.md)\n~~~\n");
    const result = await cli(source, [destination], parent);

    expectSuccess(result);
    expect(linkProblems(destination)).toEqual([]);
    expect(file(join(destination, "skills/alpha/references/notes.md"))).toBe(file(join(source, "skills/alpha/references/notes.md")));
  });

  test("nested-label Markdown link with a missing target aborts before destination creation", async () => {
    const { source, parent, destination } = fixture();
    const text = "---\nname: alpha\ndescription: Fixture skill\n---\n\n[Guide [details]](references/missing.md)\n";
    write(source, "skills/alpha/SKILL.md", text);
    expect(Bun.markdown.html(text)).toContain('href="references/missing.md"');
    expect(markdownDestinations(text)).toEqual(["references/missing.md"]);
    const result = await preflight(source, destination, parent);

    expect(linkProblems(source)).toHaveLength(1);
    expectRefusal(result, "skills/alpha/SKILL.md");
    expect(result.output).toContain("references/missing.md");
    expect(result.destinationCreated).toBe(false);
    expect(existsSync(destination)).toBe(false);
  });

  test("balanced-parentheses Markdown link exports its existing target", async () => {
    const { source, parent, destination } = fixture();
    const text = "---\nname: alpha\ndescription: Fixture skill\n---\n\n[Notes](references/notes(v2).md)\n";
    write(source, "skills/alpha/SKILL.md", text);
    write(source, "skills/alpha/references/notes(v2).md", "# Notes version 2\n");
    expect(Bun.markdown.html(text)).toContain('href="references/notes(v2).md"');
    expect(markdownDestinations(text)).toEqual(["references/notes(v2).md"]);
    expect(linkProblems(source)).toEqual([]);
    const result = await cli(source, [destination], parent);

    expectSuccess(result);
    expect(linkProblems(destination)).toEqual([]);
    expect(file(join(destination, "skills/alpha/references/notes(v2).md"))).toBe("# Notes version 2\n");
  });

  test.each([
    ["link-like", "Use [Format](shape) syntax"],
    ["skill-load-like", "call the Skill tool with `absent`"],
  ])("metadata-only %s description is preserved without body reference checks", async (_label, description) => {
    const { source, parent, destination } = fixture();
    const body = "\n\n# Plain body\n";
    writeSkillBody(source, body, description);
    const result = await cli(source, [destination], parent);

    expectSuccess(result);
    expect(splitSkill(file(join(destination, "skills/alpha/SKILL.md"))).metadata.description).toBe(description);
    expect(splitSkill(file(join(destination, "skills/alpha/SKILL.md"))).body).toBe(body);
    expect(linkProblems(destination)).toEqual([]);
    expect(missingLoads(destination)).toEqual([]);
  });

  test.each([
    "references/notes&#46;md",
    "references/notes&#x2e;md",
    "references/notes&period;md",
    "references/notes&#46md",
    "references/notes&#x2emd",
  ])("raw HTML href %s resolves to the existing literal notes.md target", async (href) => {
    const { source, parent, destination } = fixture();
    const body = rawLinkBody(href);
    writeSkillBody(source, body);
    const result = await cli(source, [destination], parent);

    expectSuccess(result);
    expect(file(join(destination, "skills/alpha/references/notes.md"))).toBe("# Notes\n\nUse the fixture.\n");
    expect(splitSkill(file(join(destination, "skills/alpha/SKILL.md"))).body).toBe(body);
  });

  test("raw HTML href is decoded once to a literal notes&period;md filename", async () => {
    const { source, parent, destination } = fixture();
    const body = '\n\n<a href="references/notes&amp;period;md">Notes</a>\n';
    rmSync(join(source, "skills/alpha/references/notes.md"));
    write(source, "skills/alpha/references/notes&period;md", "# Literal entity filename\n");
    writeSkillBody(source, body);
    const result = await cli(source, [destination], parent);

    expectSuccess(result);
    expect(file(join(destination, "skills/alpha/references/notes&period;md"))).toBe("# Literal entity filename\n");
    expect(existsSync(join(destination, "skills/alpha/references/notes.md"))).toBe(false);
    expect(splitSkill(file(join(destination, "skills/alpha/SKILL.md"))).body).toBe(body);
  });

  test.each([
    ["references/&copy.md", "references/©.md"],
    ["references/&copy=notes.md", "references/&copy=notes.md"],
  ])("raw HTML legacy href %s preserves attribute-context semantics", async (href, target) => {
    const { source, parent, destination } = fixture();
    const body = rawLinkBody(href);
    rmSync(join(source, "skills/alpha/references/notes.md"));
    write(join(source, "skills/alpha"), target, "# Legacy attribute target\n");
    writeSkillBody(source, body);
    const result = await cli(source, [destination], parent);

    expectSuccess(result);
    expect(file(join(destination, "skills/alpha", target))).toBe("# Legacy attribute target\n");
    expect(splitSkill(file(join(destination, "skills/alpha/SKILL.md"))).body).toBe(body);
  });

  test("raw HTML encoded image src resolves to its existing literal image.png target", async () => {
    const { source, parent, destination } = fixture();
    const body = '\n\n<img src="references/image&period;png" alt="Fixture">\n';
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    write(source, "skills/alpha/references/image.png", bytes);
    writeSkillBody(source, body);
    const result = await cli(source, [destination], parent);

    expectSuccess(result);
    expect(readFileSync(join(destination, "skills/alpha/references/image.png"))).toEqual(bytes);
    expect(splitSkill(file(join(destination, "skills/alpha/SKILL.md"))).body).toBe(body);
  });

  test("raw HTML encoded missing href fails preflight with its decoded destination", async () => {
    const { source, parent, destination } = fixture();
    const body = '\n\n<a href="references/missing&period;md">Missing</a>\n';
    writeSkillBody(source, body);
    const result = await preflight(source, destination, parent);

    expectRefusal(result, "references/missing.md");
    expect(result.output).toContain("skills/alpha/SKILL.md");
    expect(result.destinationCreated).toBe(false);
    expect(existsSync(destination)).toBe(false);
  });

  test("exported screenshot helper preserves an existing deterministic refusal fixture", async () => {
    const api = requireExporter();
    const destination = join(temporaryDirectory(), "team");
    await api.exportPlugin(ROOT, destination);
    const helper = await import(pathToFileURL(join(destination, "skills/pr-screenshots/scripts/splice.mjs")).href);
    const result = helper.splice(REAL_SCREENSHOTS, DEGRADED_SCREENSHOTS);

    expect(result.body).toBe(REAL_SCREENSHOTS);
    expect(result.changed).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
    expect(lstatSync(join(destination, "skills/pr-screenshots/scripts/splice.mjs")).mode & 0o111).toBe(lstatSync(join(ROOT, "skills/pr-screenshots/scripts/splice.mjs")).mode & 0o111);
  });
});

function writeSkillBody(source: string, body: string, description = "Fixture skill"): void {
  const metadata = Bun.YAML.stringify({ name: "alpha", description }, null, 2);
  write(source, "skills/alpha/SKILL.md", `---\n${metadata}\n---${body}`);
}

function rawLinkBody(href: string): string {
  return `\n\n<a href="${href}">Notes</a>\n`;
}

function removeSkills(source: string, state: string): void {
  rmSync(join(source, "skills"), { recursive: true });
  if (state === "empty") mkdirSync(join(source, "skills"));
}

function existingDestination(parent: string, destination: string, kind: string): void {
  if (kind === "directory") write(destination, "keep.txt", "existing directory\n");
  if (kind === "file") writeFileSync(destination, "existing file\n");
  if (kind === "live symlink") {
    write(parent, "target/keep.txt", "symlink target\n");
    symlinkSync(join(parent, "target"), destination);
  }
  if (kind === "dangling symlink") symlinkSync(join(parent, "absent"), destination);
}

function writeBrokenLink(source: string, target: string): void {
  write(source, "skills/alpha/SKILL.md", `---\nname: alpha\ndescription: Broken link fixture\n---\n\n[Resource](${target})\n`);
}

function exportedMetadataProblems(api: Exporter, destination: string): string[] {
  const problems: string[] = [];
  for (const name of [...skillNames(destination)].sort()) {
    const path = join(destination, "skills", name, "SKILL.md");
    const text = file(path);
    const metadata = splitSkill(text).metadata;
    for (const key of Object.keys(metadata)) if (!PORTABLE_FIELDS.includes(key)) problems.push(`${name}: unsupported ${key}`);
    try {
      const projected = api.projectSkill(text, name, path);
      if (!projected.eligible) problems.push(`${name}: exported guarded skill`);
    } catch (error) {
      problems.push(`${name}: ${String(error)}`);
    }
  }
  return problems;
}

function packageDifferences(source: string, destination: string): string[] {
  const inventory = sourceInventory(source);
  const problems: string[] = [];
  const expectedFiles: string[] = [];
  for (const path of paths(join(source, "skills"))) {
    if (lstatSync(join(source, "skills", path)).isDirectory() || path.split(sep)[1] === "agents") continue;
    const discovery = path.split(sep).length === 2 && basename(path) === "SKILL.md";
    if (discovery && inventory.omitted.includes(path.split(sep)[0]!)) continue;
    expectedFiles.push(path);
    const output = join(destination, "skills", path);
    if (!existsSync(output)) { problems.push(`${path}: missing`); continue; }
    const input = join(source, "skills", path);
    const sourceBytes = discovery ? Buffer.from(splitSkill(file(input)).body) : readFileSync(input);
    const outputBytes = discovery ? Buffer.from(splitSkill(file(output)).body) : readFileSync(output);
    if (!sourceBytes.equals(outputBytes)) problems.push(`${path}: bytes differ`);
    if ((lstatSync(input).mode & 0o111) !== (lstatSync(output).mode & 0o111)) problems.push(`${path}: executable bits differ`);
  }
  const actualFiles = paths(join(destination, "skills")).filter((path) => !lstatSync(join(destination, "skills", path)).isDirectory());
  for (const path of actualFiles) if (!expectedFiles.includes(path)) problems.push(`${path}: unexpected`);
  return problems.sort();
}

// Existing inputs from tests/pr-screenshots-skill.test.ts, "splice will not
// downgrade a section holding real screenshots".
const REAL_SCREENSHOTS = "## Summary\n\nAdds a login page.\n\n## Screenshots\n\n**Login** (default)\n![screenshot-01](https://github.com/user-attachments/assets/abcd)\n\nCloses #12\n";
const DEGRADED_SCREENSHOTS = "## Screenshots\n\n**Login** (default) — captured, not yet uploaded: login.png";
