import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { decodeHTMLAttribute } from "entities";

const SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const PORTABLE = ["name", "description", "license", "compatibility", "metadata", "allowed-tools"];
const NATIVE: Record<string, string> = {
  effort: "string", "argument-hint": "string", "user-invocable": "boolean", "disable-model-invocation": "boolean",
};

function fail(path: string, rule: string): never {
  throw new Error(`${path}: ${rule}`);
}

function mapping(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown, path: string, field: string): asserts value is string {
  if (typeof value !== "string") fail(path, `${field} must be a string`);
}

export function validateManifest(text: string, path: string): Record<string, unknown> {
  let manifest: unknown;
  try { manifest = JSON.parse(text); }
  catch (error) { throw new Error(`${path}: invalid JSON`, { cause: error }); }
  if (!mapping(manifest)) fail(path, "manifest must be an object");
  for (const [key, value] of Object.entries(manifest)) {
    if (["extensions", "mcp", "mcpServers"].includes(key)) fail(path, `${key} requires an export profile audit`);
    if (["$schema", "name", "version", "description", "homepage", "repository", "license"].includes(key)) {
      stringField(value, path, key);
    } else if (key === "keywords") {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) fail(path, "keywords must be an array of strings");
    } else if (key === "author") {
      if (!mapping(value)) fail(path, "author must be an object");
      for (const [field, entry] of Object.entries(value)) {
        if (!["name", "email", "url"].includes(field)) fail(path, `author.${field} is not permitted`);
        stringField(entry, path, `author.${field}`);
      }
    } else fail(path, `${key} requires an export profile audit`);
  }
  if (manifest.$schema !== SCHEMA) fail(path, `$schema must equal ${SCHEMA}`);
  const name = manifest.name;
  stringField(name, path, "name");
  if (name.length < 1 || name.length > 64 || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(name) || /--|\.\./.test(name)) {
    fail(path, "name must be 1–64 lowercase ASCII letters/digits/dots/hyphens, with alphanumeric endpoints and no repeated separator");
  }
  return manifest;
}

export function projectSkill(text: string, directory: string, path: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/.exec(text);
  if (!match) fail(path, "missing delimited YAML frontmatter");
  let source: unknown;
  try { source = Bun.YAML.parse(match[1]!); }
  catch (error) { throw new Error(`${path}: invalid YAML frontmatter`, { cause: error }); }
  if (!mapping(source)) fail(path, "frontmatter must be a mapping");
  for (const [key, value] of Object.entries(source)) {
    if (Object.hasOwn(NATIVE, key)) {
      if (typeof value !== NATIVE[key]) fail(path, `${key} must be ${NATIVE[key]}; export profile audit required`);
    } else if (!PORTABLE.includes(key)) fail(path, `${key} requires an export profile audit`);
    else if (key === "metadata") {
      if (!mapping(value) || Object.values(value).some((entry) => typeof entry !== "string")) fail(path, "metadata must be a string-to-string mapping");
    } else stringField(value, path, key);
  }
  const { name, description, compatibility } = source;
  stringField(name, path, "name");
  if (name.length < 1 || name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name !== directory) {
    fail(path, "name must match its directory and contain 1–64 lowercase ASCII letters/digits with single internal hyphens");
  }
  stringField(description, path, "description");
  // The Python reference validator also treats four C0 separators as whitespace.
  if (/^[\p{White_Space}\u001c-\u001f]*$/u.test(description)) fail(path, "description must not be blank");
  if ([...description].length > 1024) fail(path, "description length must be 1–1024");
  if (typeof compatibility === "string" && ([...compatibility].length < 1 || [...compatibility].length > 500)) fail(path, "compatibility length must be 1–500");
  const metadata = Object.fromEntries(PORTABLE.filter((key) => Object.hasOwn(source, key)).map((key) => [key, source[key]]));
  const body = text.slice(match[0].length);
  return { metadata, body, content: `---\n${Bun.YAML.stringify(metadata, null, 2)}\n---${body}`, eligible: source["disable-model-invocation"] !== true };
}

type File = { path: string; bytes: Buffer; mode: number };
type Package = { files: File[]; directories: string[]; omitted: string[]; skills: string[] };

function inside(root: string, path: string): boolean {
  const child = relative(root, path);
  return !isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`);
}

function inputStat(path: string) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) fail(path, "symbolic link inputs are unsupported");
  if (!stat.isFile() && !stat.isDirectory()) fail(path, "unsupported special file; require a regular file or directory");
  return stat;
}

function readInput(path: string, output: string): File {
  const stat = inputStat(path);
  if (!stat.isFile()) fail(path, "require a regular file");
  return { path: output, bytes: readFileSync(path), mode: stat.mode & 0o777 };
}

function markdownLinks(text: string): string[] {
  const links: string[] = [];
  new HTMLRewriter().on("a[href], img[src]", {
    element(element) {
      const attribute = element.getAttribute(element.tagName === "a" ? "href" : "src");
      if (attribute !== null) links.push(decodeHTMLAttribute(attribute));
    },
  }).transform(Bun.markdown.html(text));
  return links.filter((target) => !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target));
}

function validateReferences(pkg: Package, root: string) {
  const paths = new Set([...pkg.files.map((file) => file.path), ...pkg.directories]);
  for (const file of pkg.files.filter((entry) => entry.path.endsWith(".md"))) {
    const content = file.bytes.toString("utf8");
    const skill = pkg.skills.find((name) => file.path === join("skills", name, "SKILL.md"));
    const text = skill ? projectSkill(content, skill, join(root, file.path)).body : content;
    for (const link of markdownLinks(text)) {
      let decoded: string;
      try { decoded = decodeURIComponent(link.split(/[?#]/)[0]!); }
      catch (error) { throw new Error(`${file.path}: invalid link ${link}`, { cause: error }); }
      const target = resolve(root, dirname(file.path), decoded);
      if (!inside(root, target) || !paths.has(relative(root, target))) fail(file.path, `link ${link} must resolve inside the exported package`);
    }
    if (!file.path.startsWith(`skills${sep}`)) continue;
    const flat = text.replace(/\s+/g, " ").trim();
    for (const match of flat.matchAll(/call the Skill tool with\b/gi)) {
      const clause = flat.slice(match.index + match[0].length).split(/(?<=[.:;!?])\s/)[0]!;
      for (const name of clause.matchAll(/`([a-z0-9][a-z0-9-]*)`/g)) {
        if (!pkg.skills.includes(name[1]!)) fail(file.path, `loaded skill ${name[1]} is absent from exported discovery`);
      }
    }
  }
}

function preflight(source: string): Package {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const name = entry.name;
    const namespaceDirectory = entry.isDirectory() && !name.startsWith(".") && name.includes(".");
    if (["mcp.json", ".mcp.json", "extensions"].includes(name) || namespaceDirectory) fail(join(source, name), "requires an export profile audit");
  }
  const files = [readInput(join(source, "plugin.json"), "plugin.json"), readInput(join(source, "LICENSE"), "LICENSE")];
  validateManifest(files[0]!.bytes.toString("utf8"), join(source, "plugin.json"));
  if (!inputStat(join(source, "docs")).isDirectory()) fail(join(source, "docs"), "require a directory");
  files.push(readInput(join(source, "docs/agent-plugins.md"), "README.md"));
  const pkg: Package = { files, directories: ["skills"], omitted: [], skills: [] };
  const skillsRoot = join(source, "skills");
  if (!inputStat(skillsRoot).isDirectory()) fail(skillsRoot, "require a skills directory");
  const entries = readdirSync(skillsRoot).sort();
  if (!entries.length) fail(skillsRoot, "incomplete Team input: skills directory is empty");
  for (const name of entries) {
    const directory = join(skillsRoot, name);
    if (inputStat(directory).isFile()) {
      files.push(readInput(directory, join("skills", name)));
      continue;
    }
    const discovery = readInput(join(directory, "SKILL.md"), join("skills", name, "SKILL.md"));
    const projected = projectSkill(discovery.bytes.toString("utf8"), name, join(directory, "SKILL.md"));
    if (projected.eligible) {
      pkg.skills.push(name);
      files.push({ ...discovery, bytes: Buffer.from(projected.content) });
    } else pkg.omitted.push(name);
    collectResources(source, join("skills", name), pkg);
  }
  if (!pkg.skills.length && !pkg.omitted.length) fail(skillsRoot, "incomplete Team input: no skill declarations");
  validateReferences(pkg, source);
  return pkg;
}

function collectResources(source: string, path: string, pkg: Package) {
  pkg.directories.push(path);
  for (const name of readdirSync(join(source, path)).sort()) {
    const child = join(path, name);
    const absolute = join(source, child);
    const stat = inputStat(absolute);
    const immediate = path.split(sep).length === 2;
    if (immediate && name === "SKILL.md") continue;
    if (immediate && name === "agents") {
      if (!stat.isDirectory()) fail(absolute, "native agents registration must be a directory");
      for (const registration of readdirSync(absolute).sort()) {
        const registered = join(absolute, registration);
        const registeredStat = inputStat(registered);
        if (registration !== "openai.yaml" || !registeredStat.isFile()) fail(registered, "unexpected native registration requires an export profile audit");
      }
    } else if (stat.isDirectory()) collectResources(source, child, pkg);
    else pkg.files.push(readInput(absolute, child));
  }
}

function validateOutput(destination: string, expected: Package) {
  const files: File[] = [];
  const directories: string[] = [];
  function visit(path: string) {
    for (const name of readdirSync(join(destination, path)).sort()) {
      const child = join(path, name);
      if (inputStat(join(destination, child)).isDirectory()) {
        directories.push(child);
        visit(child);
      } else files.push(readInput(join(destination, child), child));
    }
  }
  visit("");
  if (files.length !== expected.files.length || directories.slice().sort().join("\n") !== expected.directories.slice().sort().join("\n")) fail(destination, "final output inventory differs from the validated package");
  for (const file of files) {
    const original = expected.files.find((entry) => entry.path === file.path);
    if (!original || !original.bytes.equals(file.bytes) || original.mode !== file.mode) fail(join(destination, file.path), "final output bytes or permissions differ from the validated package");
    if (file.path === "plugin.json") validateManifest(file.bytes.toString("utf8"), join(destination, file.path));
    if (file.path.split(sep).length === 3 && basename(file.path) === "SKILL.md") {
      projectSkill(file.bytes.toString("utf8"), basename(dirname(file.path)), join(destination, file.path));
    }
  }
  validateReferences({ ...expected, files, directories }, destination);
}

export async function exportPlugin(sourceRoot: string, destination: string): Promise<{ destination: string; omitted: string[] }> {
  if (!isAbsolute(destination)) fail(destination, "destination must be absolute");
  const source = realpathSync(sourceRoot);
  const output = join(realpathSync(dirname(resolve(destination))), basename(resolve(destination)));
  if (inside(source, output)) fail(destination, "destination must be outside the source checkout");
  try {
    lstatSync(output);
    fail(destination, "destination exists; choose a fresh directory");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const pkg = preflight(source);
  try { mkdirSync(output); }
  catch (error) {
    throw new Error(`${destination}: mkdir failed; choose a fresh directory: ${String(error)}`, { cause: error });
  }
  // Only the invocation that exclusively created output may remove it.
  try {
    for (const directory of pkg.directories) mkdirSync(join(output, directory));
    for (const file of pkg.files) {
      writeFileSync(join(output, file.path), file.bytes, { flag: "wx", mode: file.mode });
      chmodSync(join(output, file.path), file.mode);
    }
    validateOutput(output, pkg);
  } catch (error) {
    try { rmSync(output, { recursive: true }); }
    catch (cleanup) { throw new Error(`${destination}: export failed: ${String(error)}; cleanup removal failed: ${String(cleanup)}`, { cause: error }); }
    throw new Error(`${destination}: export failed: ${String(error)}`, { cause: error });
  }
  return { destination, omitted: pkg.omitted };
}

if (import.meta.main) {
  try {
    if (process.argv.length !== 3) fail("export:agent-plugin", "usage: bun run export:agent-plugin /absolute/fresh-directory");
    const result = await exportPlugin(resolve(import.meta.dir, ".."), process.argv[2]!);
    console.log(`Exported ${result.destination}\nOmitted discovery: ${result.omitted.join(", ") || "none"}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
