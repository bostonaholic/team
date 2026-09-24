// Fails when a skills/**/*.md or agents/*.md file references a missing path in one of these forms:
// - outside fenced code, from the file's directory or (under skills/) its skill root:
//   [text](path) links, and code spans starting with references/, playbooks/, scripts/,
//   resources/, or ../<skill>/.
// - outside fenced code, from the plugin root: code spans starting with skills/.
// - everywhere, fences included: ${CLAUDE_PLUGIN_ROOT}/path from the plugin root,
//   <NAME-skill-dir>/path from skills/NAME, and <skill-dir>/path like a link.
// Skips URLs, pure anchors, and paths holding < > { } [ ] * ? $ …. An unclosed fence fails.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import test from "node:test";

const PLACEHOLDER = /[<>{}[\]*?$…]/;
const SKILL_LOCAL = /^(?:(?:references|playbooks|scripts|resources)\/|\.\.\/[\w-]+\/)/;

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

function references(file) {
  const [tree, skill] = file.split(sep);
  const local = tree === "skills" ? [dirname(file), join(tree, skill)] : [dirname(file)];
  const found = [];
  let fence = null;
  readFileSync(file, "utf8").split(/\r?\n/).forEach((text, index) => {
    const add = (path, bases) => found.push({ file, line: index + 1, path: path.replace(/#.*$/, ""), bases });
    for (const [, path] of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"'`)]+)/g)) add(path, ["."]);
    for (const [, name, path] of text.matchAll(/<(?:([\w-]+)-)?skill-dir>\/([^\s"'`)]+)/g)) {
      add(path, name ? [join("skills", name)] : local);
    }

    const marker = text.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence.marker[0] && marker[1].length >= fence.marker.length && !marker[2].trim()) {
        fence = null;
      }
      return;
    }
    if (marker) {
      fence = { marker: marker[1], line: index + 1 };
      return;
    }

    for (const [, span] of text.matchAll(/`([^`]+)`/g)) {
      const path = span.trim().split(/\s/)[0];
      if (path.startsWith("skills/")) add(path, ["."]);
      else if (SKILL_LOCAL.test(path)) add(path, local);
    }
    for (const [, target] of text.replace(/`[^`]+`/g, "").matchAll(/\]\(([^)\s]+)/g)) add(target, local);
  });
  if (fence) found.push({ file, line: fence.line, path: "unclosed code fence", bases: [] });
  return found;
}

test("skill and agent files reference only paths that exist", () => {
  const checked = ["skills", "agents"]
    .flatMap(markdownFiles)
    .flatMap(references)
    .filter(({ path }) => path && !/^[a-z][\w+.-]*:/i.test(path) && !PLACEHOLDER.test(path));
  const missing = checked
    .filter(({ path, bases }) => !bases.some((base) => existsSync(join(base, path))))
    .map(({ file, line, path }) => `${file}:${line} -> ${path}`);

  assert.ok(checked.length > 0, "found no path references under skills/ or agents/");
  assert.deepEqual(missing, []);
});
