import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

function safePath(path) {
  const marker = path.match(/[$`@]/)?.[0];
  if (marker) {
    throw new Error(`Unsupported character ${JSON.stringify(marker)} in ${path}. Relocate the checkout to a path without $, backticks, or @.`);
  }
}

function requireType(path, type) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !(type === "directory" ? stat.isDirectory() : stat.isFile())) {
    throw new Error(`Expected a real ${type}, not a link or other file type: ${path}`);
  }
}

function stringScalar(value, fail) {
  let decoded;
  if (value.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(value)) fail("invalid single-quoted string");
    decoded = value.slice(1, -1).replaceAll("''", "'");
  } else if (value.startsWith('"')) {
    try { decoded = JSON.parse(value); }
    catch { fail("invalid double-quoted string"); }
  } else {
    if (!value || /^[\[\]{}|>&*!?#%@`]/.test(value) || /^-(?:\s|$)|:(?:\s|$)|\s#/.test(value) ||
        /^(?:null|true|false|yes|no|on|off|~|[-+]?\d.*|[-+]?\.(?:\d.*|inf|nan))$/i.test(value)) {
      fail("expected a plain or quoted string; unsupported scalar form");
    }
    decoded = value;
  }
  if (typeof decoded !== "string" || !decoded.trim()) fail("expected a nonempty string");
  return decoded;
}

function header(source, file) {
  const lines = source.split(/\r?\n/);
  const fail = (message) => { throw new Error(`Invalid frontmatter in ${file}: ${message}`); };
  if (lines[0] !== "---") fail("missing opening ---");
  const end = lines.indexOf("---", 1);
  if (end < 0) fail("missing closing ---");
  const values = new Map();
  const consumed = /^(name|description|disable-model-invocation):\s*(.*)$/;
  let previousConsumed = false;
  for (const line of lines.slice(1, end)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (previousConsumed && /^\s/.test(line)) fail("multiline consumed fields are unsupported");
    const match = line.match(consumed);
    previousConsumed = Boolean(match);
    if (!match) {
      if (/^\s*(?:['"]?(?:name|description|disable-model-invocation)['"]?\s*:|<<\s*:)/.test(line) ||
          !/^\s*[\w-]+\s*:|^\s+\S/.test(line)) {
        fail(`unsupported or ambiguous field: ${line}`);
      }
      continue;
    }
    const [, key, raw] = match;
    if (values.has(key)) fail(`duplicate ${key}`);
    const value = raw.trim();
    if (key === "disable-model-invocation") {
      if (value !== "true" && value !== "false") fail(`${key} must be an unquoted boolean`);
      values.set(key, value === "true");
    } else {
      values.set(key, stringScalar(value, (message) => fail(`${key}: ${message}`)));
    }
  }
  for (const key of ["name", "description"]) {
    if (!values.has(key)) fail(`missing ${key}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.get("name"))) fail("invalid skill name");
  return { name: values.get("name"), description: values.get("description"), guarded: values.get("disable-model-invocation") === true };
}

function inspectTree(directory, base) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are unsupported in skill trees: ${path}`);
    if (entry.name === "SKILL.md" && directory !== base) {
      throw new Error(`Nested SKILL.md would expose an unintended native skill: ${path}`);
    }
    if (entry.isDirectory()) inspectTree(path, base);
  }
}

export function loadCatalog(root) {
  const checkout = realpathSync(root);
  safePath(checkout);
  for (const file of ["team.js", "catalog.mjs"]) requireType(join(checkout, "opencode", file), "file");
  const skills = join(checkout, "skills");
  requireType(skills, "directory");
  const catalog = [];
  const names = new Map();
  for (const entry of readdirSync(skills, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const base = join(skills, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are unsupported in the skills root: ${base}`);
    if (!entry.isDirectory()) continue;
    safePath(base);
    requireType(base, "directory");
    const file = join(base, "SKILL.md");
    requireType(file, "file");
    inspectTree(base, base);
    const metadata = header(readFileSync(file, "utf8"), file);
    if (names.has(metadata.name)) {
      throw new Error(`Duplicate skill name ${metadata.name}: ${names.get(metadata.name)} and ${file}`);
    }
    names.set(metadata.name, file);
    catalog.push({ ...metadata, base, file });
  }
  if (!catalog.length) throw new Error(`No skills found in ${skills}; restore the checkout's SKILL.md files.`);
  return catalog;
}
