// Fails when a skills/**/*.md or agents/*.md file references a missing path in one of these forms:
// - outside fenced code, from the file's directory or (under skills/) its skill root:
//   [text](path) links, and code spans starting with references/, playbooks/, scripts/,
//   resources/, or ../<skill>/. A span wrapped across lines is skipped.
// - outside fenced code, from the plugin root: code spans starting with skills/.
// - everywhere, fences included: ${CLAUDE_PLUGIN_ROOT}/path and <installed-team-root>/path
//   from the plugin root, <skills-root>/path from skills/, <NAME-skill-dir>/path from
//   skills/NAME, <refs-dir>/path from the file's directory, and <skill-dir>/path like a link.
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
  const roots = { "skill-dir": local, "refs-dir": [dirname(file)], "skills-root": ["skills"], "installed-team-root": ["."] };
  const found = [];
  let fence = null;
  let openSpan = false;
  readFileSync(file, "utf8").split(/\r?\n/).forEach((text, index) => {
    const add = (path, bases) => found.push({ file, line: index + 1, path: path.replace(/#.*$/, ""), bases });
    for (const [, path] of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"'`)]+)/g)) add(path, ["."]);
    for (const [, root, path] of text.matchAll(/<([\w-]+)>\/([^\s"'`)]+)/g)) {
      const bases = root.endsWith("-skill-dir") ? [join("skills", root.replace(/-skill-dir$/, ""))] : roots[root];
      if (bases) add(path, bases);
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
      openSpan = false;
      return;
    }

    // Drop the parts of a code span that wraps across lines so backtick pairing stays aligned.
    let prose = text;
    if (!prose.trim()) openSpan = false;
    if (openSpan) {
      if (!prose.includes("`")) return;
      prose = prose.slice(prose.indexOf("`") + 1);
    }
    openSpan = (prose.match(/`/g) ?? []).length % 2 === 1;
    if (openSpan) prose = prose.slice(0, prose.lastIndexOf("`"));

    for (const [, span] of prose.matchAll(/`([^`]+)`/g)) {
      const path = span.trim().split(/\s/)[0];
      if (path.startsWith("skills/")) add(path, ["."]);
      else if (SKILL_LOCAL.test(path)) add(path, local);
    }
    for (const [, target] of prose.replace(/`[^`]+`/g, "").matchAll(/\]\(([^)\s]+)/g)) add(target, local);
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
