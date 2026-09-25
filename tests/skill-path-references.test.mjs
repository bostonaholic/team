// Fails when a skills/**/*.md or agents/*.md file references a missing path in one of these forms:
// - outside fenced code, from the file's directory or (under skills/) its skill root:
//   [text](path) links, and code spans starting with references/, playbooks/, scripts/,
//   resources/, or ../<skill>/. A code span closes at the next backtick run of its opener's
//   length; a span that wraps across lines is not checked, but text after it is.
// - outside fenced code, from the plugin root: code spans starting with skills/.
// - everywhere, fences included: ${CLAUDE_PLUGIN_ROOT}/path and <installed-team-root>/path
//   from the plugin root, <skills-root>/path from skills/, <NAME-skill-dir>/path from
//   skills/NAME, <refs-dir>/path from the file's directory, and <skill-dir>/path like a link.
// A line starting with ``` opens a fence only if the rest of the line holds no backtick.
// Skips URLs, pure anchors, and paths holding < > { } [ ] * ? $ …. Fails on a fence still
// open at EOF, or a code span still open at a blank line, fence, or EOF.
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
  const unclosed = (what, line) => found.push({ file, line, path: `unclosed code ${what}`, bases: [] });
  let fence = null;
  let span = null; // a code span still open at the end of the previous line
  readFileSync(file, "utf8").split(/\r?\n/).forEach((text, index) => {
    const add = (path, bases) => found.push({ file, line: index + 1, path: path.replace(/#.*$/, ""), bases });
    for (const [, path] of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"'`)]+)/g)) add(path, ["."]);
    for (const [, root, path] of text.matchAll(/<([\w-]+)>\/([^\s"'`)]+)/g)) {
      const bases = root.endsWith("-skill-dir") ? [join("skills", root.replace(/-skill-dir$/, ""))] : roots[root];
      if (bases) add(path, bases);
    }

    let marker = text.match(/^\s*(`{3,}|~{3,})(.*)$/);
    // CommonMark: a backtick fence's info string cannot contain a backtick, so such a line is prose.
    if (marker?.[1][0] === "`" && marker[2].includes("`")) marker = null;
    if (fence) {
      if (marker && marker[1][0] === fence.marker[0] && marker[1].length >= fence.marker.length && !marker[2].trim()) {
        fence = null;
      }
      return;
    }
    if (marker || !text.trim()) {
      if (span) unclosed("span", span.line);
      span = null;
      if (marker) fence = { marker: marker[1], line: index + 1 };
      return;
    }

    // Split the line into prose and the code spans that open and close on it.
    const spans = [];
    let prose = "";
    let cursor = 0;
    let wrapped = span !== null;
    for (const run of text.matchAll(/`+/g)) {
      if (!span) {
        prose += text.slice(cursor, run.index);
        span = { length: run[0].length, line: index + 1 };
      } else if (run[0].length === span.length) {
        if (!wrapped) spans.push(text.slice(cursor, run.index));
        span = null;
        wrapped = false;
      } else continue;
      cursor = run.index + run[0].length;
    }
    if (!span) prose += text.slice(cursor);

    for (const code of spans) {
      const path = code.trim().split(/\s/)[0];
      if (path.startsWith("skills/")) add(path, ["."]);
      else if (SKILL_LOCAL.test(path)) add(path, local);
    }
    for (const [, target] of prose.matchAll(/\]\(([^)\s]+)/g)) add(target, local);
  });
  if (span) unclosed("span", span.line);
  if (fence) unclosed("fence", fence.line);
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
