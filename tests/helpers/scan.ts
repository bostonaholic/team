// Shared scanning primitives for the structural (L2) test suites: file
// enumerators, grep wrappers, a Markdown code extractor, an `rm -rf` operand
// parser, and the allowlist verdict. Everything pure is unit-tested in
// scan.test.ts; the grep wrappers shell out to system grep — never
// `git grep -E`, which silently ignores `\b` and returns a false green.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();

// Absence check: runs grep through execFileSync. A non-zero exit (grep found
// nothing) is the PASS and returns true; a zero exit (a match was found)
// returns false. grep's exit code 2 (a real error, e.g. unreadable path)
// re-throws so it cannot be a false pass.
export function grepAbsent(args: string[]): boolean {
  try {
    execFileSync("grep", args, { cwd: REPO_ROOT, stdio: "pipe" });
    return false; // exit 0: a match was found
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 1) return true; // exit 1: no match -> absence holds
    throw err; // exit 2 or spawn failure: surface loudly
  }
}

// Resolve `agents/*.md` and `hooks/*.mjs` globs, returning repo-relative paths
// so grep receives the same file list a shell glob would expand to.
export function agentFiles(): string[] {
  return readdirSync(join(REPO_ROOT, "agents"))
    .filter((n) => n.endsWith(".md"))
    .sort()
    .map((n) => join("agents", n));
}

export function skillFiles(): string[] {
  return readdirSync(join(REPO_ROOT, "skills"))
    .sort()
    .map((n) => join("skills", n, "SKILL.md"))
    .filter((p) => existsSync(join(REPO_ROOT, p)));
}

// Runtime hooks only (`hooks/*.mjs`). Named to stay distinct from the private
// hookFiles() in tests/hook-output-schema.test.ts, which walks dev hooks too
// and returns absolute paths — a same-named export would invite a silent
// import swap between the two contracts.
export function runtimeHookFiles(): string[] {
  return readdirSync(join(REPO_ROOT, "hooks"))
    .filter((n) => n.endsWith(".mjs"))
    .sort()
    .map((n) => join("hooks", n));
}

// Every file under skills/, recursively — SKILL.md, bundled scripts,
// registry.json — because a host binding can hide in any of them.
// skills/.gitkeep is scaffolding, not distributed content.
export function skillTreeFiles(): string[] {
  function walk(relativeDir: string): string[] {
    const collected: string[] = [];
    for (const entry of readdirSync(join(REPO_ROOT, relativeDir), { withFileTypes: true })) {
      const relativePath = join(relativeDir, entry.name);
      if (entry.isDirectory()) collected.push(...walk(relativePath));
      else collected.push(relativePath);
    }
    return collected;
  }
  return walk("skills")
    .filter((p) => p !== join("skills", ".gitkeep"))
    .sort();
}

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

// Match collector: system `grep -onHE` over the given files, returning one
// (path, line, matched text) triple per match. Exit 1 (no match) returns
// empty; exit 2 (a real error) re-throws so a blind scan cannot pass
// silently. This is the function the `\b` pin targets: grepAbsent() returns
// a boolean and structurally cannot carry a positive detection signal.
export function collectMatches(pattern: string, files: string[]): GrepMatch[] {
  if (files.length === 0) return [];
  let output: string;
  try {
    output = execFileSync("grep", ["-onHE", pattern, ...files], {
      cwd: REPO_ROOT,
      stdio: "pipe",
    }).toString();
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 1) return []; // exit 1: no match anywhere
    throw err; // exit 2 or spawn failure: surface loudly
  }
  return output
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const pathEnd = line.indexOf(":");
      const lineEnd = line.indexOf(":", pathEnd + 1);
      return {
        path: line.slice(0, pathEnd),
        line: Number(line.slice(pathEnd + 1, lineEnd)),
        text: line.slice(lineEnd + 1),
      };
    });
}

export interface CodeSpan {
  line: number; // 1-based physical line of the span (first line when joined)
  text: string;
  kind: "fence" | "inline";
}

// Extract the code the Markdown actually marks as code: fenced-block content
// (one span per logical line, trailing-`\` continuations joined) and
// inline-code spans from prose. Bare prose is never a span.
//
// Fence recognition follows CommonMark where it matters to this repo's
// files: markers may be indented up to three spaces (four is an indented
// code block, not a fence), a closing fence needs at least the opening
// fence's backtick count and no info string, and a one-level blockquote
// `>`/`> ` prefix is stripped from markers and content alike. An
// unterminated fence treats the rest of the file as fenced — over-scanning
// fails loud where under-scanning would hide a violation.
export function extractCodeSpans(markdown: string): CodeSpan[] {
  const spans: CodeSpan[] = [];
  const lines = markdown.split("\n");
  let fenceLength = 0; // 0 = outside any fence
  let pendingText: string | null = null; // continuation accumulator
  let pendingLine = 0;

  function flushPending() {
    if (pendingText !== null && pendingText.trim().length > 0) {
      spans.push({ line: pendingLine, text: pendingText, kind: "fence" });
    }
    pendingText = null;
  }

  for (let index = 0; index < lines.length; index++) {
    const stripped = (lines[index] ?? "").replace(/^ {0,3}> ?/, "");

    if (fenceLength === 0) {
      const opening = stripped.match(/^ {0,3}(`{3,})([^`]*)$/);
      if (opening) {
        fenceLength = (opening[1] ?? "").length;
        continue;
      }
      for (const inline of stripped.matchAll(/`([^`]+)`/g)) {
        spans.push({ line: index + 1, text: inline[1] ?? "", kind: "inline" });
      }
      continue;
    }

    const closing = stripped.match(/^ {0,3}(`{3,})\s*$/);
    if (closing && (closing[1] ?? "").length >= fenceLength) {
      flushPending();
      fenceLength = 0;
      continue;
    }

    if (pendingText === null) {
      pendingText = stripped;
      pendingLine = index + 1;
    } else {
      pendingText += stripped;
    }
    if (pendingText.endsWith("\\")) {
      pendingText = pendingText.slice(0, -1); // shell continuation: join next
    } else {
      flushPending();
    }
  }
  flushPending(); // unterminated fence: everything since the marker counted
  return spans;
}

// Remove an unquoted shell comment (`#` opening a word) through end of text.
function stripUnquotedComment(text: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "\\" && !inSingle) {
      index++;
      continue;
    }
    if (char === "'" && !inDouble) inSingle = !inSingle;
    else if (char === '"' && !inSingle) inDouble = !inDouble;
    else if (
      char === "#" &&
      !inSingle &&
      !inDouble &&
      (index === 0 || /\s/.test(text[index - 1] ?? ""))
    ) {
      return text.slice(0, index);
    }
  }
  return text;
}

// Every `$` variable expansion among an `rm -rf` command's operands must use
// the unset-abort `${VAR:?}` form. The operand segment ends at the first
// unquoted `&&`/`||`/`;`/`|` — an expansion past that boundary belongs to the
// next command and is not `rm`'s operand. `$` inside single quotes never
// expands, so single-quoted spans are opaque; `$(...)` command substitution
// is not a variable expansion. Returns the offending expansions verbatim.
export function unguardedRmExpansions(commandText: string): string[] {
  const text = stripUnquotedComment(commandText);
  const violations: string[] = [];
  let searchFrom = 0;
  for (;;) {
    const rmIndex = text.indexOf("rm -rf", searchFrom);
    if (rmIndex === -1) break;
    searchFrom = rmIndex + "rm -rf".length;
    const preceding = rmIndex === 0 ? " " : (text[rmIndex - 1] ?? " ");
    if (!/[\s;|&(`]/.test(preceding)) continue; // substring of a longer word

    let inSingle = false;
    let inDouble = false;
    for (let index = searchFrom; index < text.length; index++) {
      const char = text[index];
      if (char === "\\" && !inSingle) {
        index++;
        continue;
      }
      if (char === "'" && !inDouble) {
        inSingle = !inSingle;
        continue;
      }
      if (char === '"' && !inSingle) {
        inDouble = !inDouble;
        continue;
      }
      if (!inSingle && !inDouble && (char === "&" || char === "|" || char === ";")) {
        break; // end of rm's operand segment
      }
      if (char !== "$" || inSingle) continue;

      const rest = text.slice(index + 1);
      if (rest.startsWith("(")) {
        // command substitution: skip to its closing paren, tracking nesting
        let depth = 0;
        let cursor = index + 1;
        for (; cursor < text.length; cursor++) {
          if (text[cursor] === "(") depth++;
          else if (text[cursor] === ")" && --depth === 0) break;
        }
        index = cursor;
        continue;
      }
      const braced = rest.match(/^\{([^}]*)\}/);
      if (braced) {
        const inner = braced[1] ?? "";
        if (!/^[A-Za-z_][A-Za-z0-9_]*:\?/.test(inner) && !/^[0-9]+:\?/.test(inner)) {
          violations.push("${" + inner + "}");
        }
        index += braced[0].length;
        continue;
      }
      const bare = rest.match(/^[A-Za-z_][A-Za-z0-9_]*|^[0-9]/);
      if (bare) {
        violations.push(`$${bare[0]}`);
        index += bare[0].length;
      }
    }
  }
  return violations;
}

export interface AllowlistEntry {
  path: string;
  count: number;
}

// Judge a sweep's matches against its allowlist. Any match at an unlisted
// path is a violation; a listed path must yield exactly its entry's count —
// more is a new violation at an authorized path, fewer is a stale entry or a
// blind collector. Non-zero expected counts are the sweep's positive
// detection signal: a collector that goes blind drives them to zero and
// fails loudly. Returns failure descriptions; empty means pass.
export function allowlistVerdict(matches: GrepMatch[], allowlist: AllowlistEntry[]): string[] {
  const failures: string[] = [];
  const byPath = new Map<string, GrepMatch[]>();
  for (const match of matches) {
    const existing = byPath.get(match.path);
    if (existing) existing.push(match);
    else byPath.set(match.path, [match]);
  }
  for (const [path, pathMatches] of byPath) {
    const entry = allowlist.find((candidate) => candidate.path === path);
    if (!entry) {
      for (const match of pathMatches) {
        failures.push(`unauthorized match at ${match.path}:${match.line}: ${match.text}`);
      }
    } else if (pathMatches.length !== entry.count) {
      failures.push(
        `${path}: allowlist expects exactly ${entry.count} match(es), found ${pathMatches.length}`,
      );
    }
  }
  for (const entry of allowlist) {
    if (!byPath.has(entry.path)) {
      failures.push(
        `${entry.path}: allowlist expects ${entry.count} match(es), found 0 — stale entry or blind collector`,
      );
    }
  }
  return failures;
}
