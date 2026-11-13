#!/usr/bin/env node
// Fails when a Markdown link or a backticked file path in the distributed plugin
// does not resolve to a file. Agents resolve a relative link from the directory
// of the file that contains it, and stop a step when that read fails.
//
// Usage: node .claude/scripts/check-links.mjs [--root <dir>]
// Exit 0 = every reference resolves, 1 = at least one does not (each printed),
// 2 = usage error.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCANNED_DIRECTORIES = ["agents", "skills", "opencode"];

// Link text may wrap onto earlier lines, so only the `](target)` half is matched.
const INLINE_LINK = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const REFERENCE_DEFINITION = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+.*)?$/;
const INLINE_CODE = /(`+)([^`]+?)\1/g;
const PATH_LIKE = /^(?:\.{1,2}\/)?[\w.-]+(?:\/[\w.-]+)+\.(?:md|mjs|js|sh|json|ya?ml)(?:#[\w-]+)?$/;
// Bare names such as `1-task.md` and paths such as `docs/plans/...` are pipeline
// artifacts written at run time, so a backticked span is checked only when its
// first segment names a shipped directory. `skills/` and `agents/` spans are
// plugin-root paths; every other one resolves from the containing file.
const FILE_RELATIVE_SEGMENTS = new Set([".", "..", "references", "principles", "playbooks", "scripts"]);
const ROOT_RELATIVE_SEGMENTS = new Set(["skills", "agents"]);

// A fenced block renders no links, but its backticked paths are still
// instructions an agent follows, so fenced lines are kept and flagged.
function markFencedLines(text) {
  let fence = null;
  return text.split("\n").map((line) => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) {
        fence = null;
        return { line: "", fenced: true };
      }
      return { line, fenced: true };
    }
    if (marker) {
      fence = marker[1];
      return { line: "", fenced: true };
    }
    return { line, fenced: false };
  });
}

function isExternal(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#") || target.startsWith("/") || target.startsWith("~");
}

function withoutFragment(target) {
  return decodeURIComponent(target.replace(/[#?].*$/, ""));
}

function backtickBase(span) {
  if (!PATH_LIKE.test(span)) return null;
  const firstSegment = span.split("/")[0];
  if (FILE_RELATIVE_SEGMENTS.has(firstSegment)) return "file";
  if (ROOT_RELATIVE_SEGMENTS.has(firstSegment)) return "root";
  return null;
}

function findReferences(text) {
  const references = [];
  markFencedLines(text).forEach(({ line, fenced }, index) => {
    const lineNumber = index + 1;
    if (!fenced) {
      const definition = line.match(REFERENCE_DEFINITION);
      if (definition) references.push({ line: lineNumber, kind: "link", base: "file", target: definition[1] });
      for (const match of line.matchAll(INLINE_LINK)) {
        references.push({ line: lineNumber, kind: "link", base: "file", target: match[1] });
      }
    }
    const withoutLinks = fenced ? line : line.replace(INLINE_LINK, "");
    for (const match of withoutLinks.matchAll(INLINE_CODE)) {
      const span = match[2].trim();
      const base = backtickBase(span);
      if (base) references.push({ line: lineNumber, kind: "code", base, target: span });
    }
  });
  return references.filter((reference) => !isExternal(reference.target));
}

function markdownFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

function checkLinks(root) {
  const failures = [];
  const files = SCANNED_DIRECTORIES.flatMap((directory) => markdownFiles(join(root, directory))).sort();
  for (const file of files) {
    const fileDirectory = dirname(file);
    for (const reference of findReferences(readFileSync(file, "utf8"))) {
      const targetPath = withoutFragment(reference.target);
      if (targetPath === "") continue;
      const base = reference.base === "root" ? root : fileDirectory;
      if (!existsSync(resolve(base, targetPath))) {
        failures.push(`${relative(root, file)}:${reference.line}: ${reference.kind} ${reference.target} does not resolve`);
      }
    }
  }
  return failures;
}

function main(argv) {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  if (argv.length === 2 && argv[0] === "--root") root = resolve(argv[1]);
  else if (argv.length !== 0) {
    process.stderr.write("check-links.mjs: usage: check-links.mjs [--root <dir>]\n");
    return 2;
  }
  const failures = checkLinks(root);
  for (const failure of failures) process.stdout.write(`FAIL ${failure}\n`);
  if (failures.length > 0) {
    process.stdout.write(`${failures.length} reference(s) do not resolve from the file that contains them.\n`);
    return 1;
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
