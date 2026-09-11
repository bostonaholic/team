import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { loadedSkills, skillNames } from "../tests/helpers/skill-refs";
import { frontmatter } from "../tests/helpers/text";

export interface InventoryIO {
  readFile?: (path: string) => Buffer;
  readGit?: (root: string) => { revision: string; dirtyPaths: string[] };
}

export interface Inventory {
  revision: string;
  inputs: string[];
  dirtyInputs: string[];
  initialBaselineEligible: boolean;
  files: { path: string; words: number; bytes: number }[];
  resources: string[];
  totals: { files: number; words: number; bytes: number };
  categories: { entry: number; methodology: number; principle: number };
  registrations: {
    skills: number;
    agents: number;
    codexManifests: number;
    hosts: Record<string, { count: number; evidence: string; sources: string[] }>;
    opencode: { commands: number; discoveryPaths: number };
  };
  skills: {
    name: string;
    category: string;
    root: { words: number; bytes: number };
    totals: { files: number; words: number; bytes: number };
    callers: { path: string; kind: "preload" | "direct" }[];
  }[];
  citations: { path: string; target: string }[];
}

const INPUT_DIRECTORIES = ["skills", "agents", ".claude-plugin", ".codex-plugin", ".agents/plugins"];
const INPUT_FILES = ["plugin.json", "opencode/team.js", "opencode/catalog.mjs"];

function treeFiles(root: string, directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? treeFiles(root, path) : [path];
  });
}

function readGit(root: string): { revision: string; dirtyPaths: string[] } {
  function git(args: string[]): string {
    const result = spawnSync("git", ["-C", root, ...args], {
      encoding: "utf8", timeout: 10_000, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    if (result.error || result.status !== 0) {
      throw new Error(`Cannot read Git metadata for ${root}: ${result.error?.message ?? result.stderr}`);
    }
    return result.stdout;
  }
  const revision = git(["rev-parse", "HEAD"]).trim();
  const entries = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0");
  const dirtyPaths: string[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!entry) continue;
    dirtyPaths.push(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2))) dirtyPaths.push(entries[++index]!);
  }
  return { revision, dirtyPaths };
}

function preloads(metadata: string): string[] {
  const names: string[] = [];
  let inList = false;
  for (const line of metadata.split("\n")) {
    if (/^skills:\s*$/.test(line)) {
      inList = true;
    } else if (inList) {
      const match = line.match(/^\s+-\s+(\S+)\s*$/);
      if (match?.[1]) names.push(match[1]);
      else inList = false;
    }
  }
  return [...new Set(names)].sort();
}

function totals(files: { words: number; bytes: number }[]): Inventory["totals"] {
  return files.reduce<Inventory["totals"]>((sum, file) => ({
    files: sum.files + 1, words: sum.words + file.words, bytes: sum.bytes + file.bytes,
  }), { files: 0, words: 0, bytes: 0 });
}

function instructionInventory(names: string[], contents: Map<string, Buffer>) {
  const categories = { entry: 0, methodology: 0, principle: 0 };
  const skills = names.map((name) => {
    const metadata = frontmatter(contents.get(`skills/${name}/SKILL.md`)!.toString("utf8"));
    const category = name.startsWith("principle-") ? "principle"
      : /^user-invocable:\s*false\s*$/m.test(metadata) ? "methodology" : "entry";
    categories[category]++;
    return {
      name, category,
      root: { words: 0, bytes: 0 },
      totals: { files: 0, words: 0, bytes: 0 },
      callers: [] as Inventory["skills"][number]["callers"],
      guarded: /^disable-model-invocation:\s*true\s*$/m.test(metadata),
    };
  });
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const files: Inventory["files"] = [];
  const citations: Inventory["citations"] = [];
  const resources: string[] = [];
  for (const [path, bytes] of contents) {
    if (!path.startsWith("skills/") && !path.startsWith("agents/")) continue;
    if (!path.endsWith(".md")) {
      resources.push(path);
      continue;
    }
    const text = bytes.toString("utf8");
    const file = { path, words: text.match(/\S+/gu)?.length ?? 0, bytes: bytes.length };
    files.push(file);
    const owner = path.startsWith("skills/") ? byName.get(path.split("/")[1]!) : undefined;
    if (owner) {
      owner.totals.files++;
      owner.totals.words += file.words;
      owner.totals.bytes += file.bytes;
      if (path === `skills/${owner.name}/SKILL.md`) owner.root = { words: file.words, bytes: file.bytes };
    }
    const agent = path.startsWith("agents/");
    const body = agent ? text.split(/^---$/m).slice(2).join("---") : text;
    const calls = [
      ...preloads(agent ? frontmatter(text) : "").map((name) => ({ name, kind: "preload" as const })),
      ...loadedSkills(body).map((name) => ({ name, kind: "direct" as const })),
    ];
    for (const { name, kind } of calls) {
      const target = byName.get(name);
      if (!target) throw new Error(`Unresolved ${kind} skill load in ${path}: ${name}`);
      target.callers.push({ path, kind });
    }
    const targets = [...new Set([...text.matchAll(/\bskills\/[a-z0-9][a-z0-9-]*\/SKILL\.md\b/g)].map((match) => match[0]))].sort();
    citations.push(...targets.map((target) => ({ path, target })));
  }
  const discoveryPaths = skills.filter((skill) => !skill.guarded).length;
  return {
    files, resources, citations, categories, discoveryPaths,
    skills: skills.map(({ guarded, ...skill }) => ({
      ...skill,
      callers: skill.callers.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.kind.localeCompare(b.kind)),
    })),
  };
}

export function collectInventory(root: string, io: InventoryIO = {}): Inventory {
  root = resolve(root);
  const names = [...skillNames(root)].sort();
  const inputs = [...INPUT_DIRECTORIES.flatMap((directory) => treeFiles(root, directory)), ...INPUT_FILES].sort();
  const contents = new Map(inputs.map((path) => {
    const absolute = join(root, path);
    let bytes: Buffer;
    try { bytes = (io.readFile ?? readFileSync)(absolute); }
    catch (cause) { throw new Error(`Cannot read inventory input ${absolute}`, { cause }); }
    return [path, bytes] as const;
  }));
  const git = (io.readGit ?? readGit)(root);
  const dirtyInputs = [...new Set(git.dirtyPaths.filter((path) =>
    INPUT_DIRECTORIES.some((directory) => path === directory || path.startsWith(`${directory}/`)) || INPUT_FILES.includes(path),
  ))].sort();
  const { discoveryPaths, ...instructions } = instructionInventory(names, contents);
  const hostSources: Record<string, string[]> = {
    claude: [".claude-plugin/"],
    codex: [".codex-plugin/", ".agents/plugins/"],
    antigravity: ["plugin.json"],
  };
  const hosts = Object.fromEntries(Object.entries(hostSources).map(([name, prefixes]) => [name, {
    count: names.length, evidence: "source-derived",
    sources: inputs.filter((path) => prefixes.some((prefix) => path.startsWith(prefix))),
  }]));
  return {
    revision: git.revision, inputs, dirtyInputs, initialBaselineEligible: dirtyInputs.length === 0,
    ...instructions, totals: totals(instructions.files),
    registrations: {
      skills: names.length,
      agents: inputs.filter((path) => /^agents\/[^/]+\.md$/.test(path)).length,
      codexManifests: inputs.filter((path) => /^skills\/[^/]+\/agents\/openai\.yaml$/.test(path)).length,
      hosts, opencode: { commands: names.length, discoveryPaths },
    },
  };
}

if (import.meta.main) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: bun run scripts/migration-inventory.ts <checkout-root>");
    console.log(JSON.stringify(collectInventory(process.argv[2]!), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
