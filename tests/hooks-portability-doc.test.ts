// tests/hooks-portability-doc.test.ts
//
// L2 static-invariant tripwire (docs/testing.md §2). docs/hooks-portability.md
// is the single source of truth for Team's hook × host port. Two contracts:
//
//   1. Every hook copy that exists on disk — and every hook path a host
//      registration points at — is listed in the doc.
//   2. Every matrix data row names a status from the fixed vocabulary, so a row
//      cannot be added without saying whether it was verified.
//
// Both are contract checks on identifiers and paths, never on prose wording. The
// negative checks are preceded by positive controls: a planted missing path and
// a planted blank status must each turn the same check red.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const DOC = join(REPO_ROOT, "docs", "hooks-portability.md");

function read(path: string): string {
  return readFileSync(path, "utf-8");
}

// Recursively collect `.mjs` files under `dir`, repo-relative, POSIX slashes.
// `hooks/lib/` holds shared libraries, not hook programs, and is excluded.
function hookCopiesOnDisk(): string[] {
  const out: string[] = [];
  const walk = (relDir: string): void => {
    for (const entry of readdirSync(join(REPO_ROOT, relDir), { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === "lib") continue;
        walk(rel);
      } else if (entry.name.endsWith(".mjs")) {
        out.push(rel);
      }
    }
  };
  walk("hooks");
  return out.sort();
}

// Every hook path a registration file names. Registrations are the machine
// contract: if one points at a file, that file belongs in the matrix.
const REGISTRATIONS = [
  join(REPO_ROOT, ".claude-plugin", "plugin.json"),
  join(REPO_ROOT, "hooks", "hooks.json"),
  join(REPO_ROOT, "hooks.json"),
  join(REPO_ROOT, "opencode", "team.js"),
];

function registeredHookPaths(): string[] {
  const found = new Set<string>();
  for (const file of REGISTRATIONS) {
    for (const match of read(file).matchAll(/hooks\/[\w./-]+\.mjs/g)) {
      if (!match[0].startsWith("hooks/lib/")) found.add(match[0]);
    }
  }
  return [...found].sort();
}

// All repo hook paths that must appear in the doc: what exists on disk plus what
// a registration points at.
function requiredHookPaths(): string[] {
  return [...new Set([...hookCopiesOnDisk(), ...registeredHookPaths()])].sort();
}

function missingFromDoc(doc: string, paths: string[]): string[] {
  return paths.filter((path) => !doc.includes(`\`${path}\``));
}

// Matrix data rows: table lines between `## Matrix` and the next `## ` heading,
// excluding the header row and the `|---|` separator.
const STATUS = /^(verified|unverified|gap)\b/;

function matrixRows(doc: string): string[] {
  const section = doc.split(/^## Matrix$/m)[1]?.split(/^## /m)[0] ?? "";
  return section
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .filter((line) => !/^\|[\s:|-]+\|$/.test(line.trim()))
    .filter((line) => !line.includes("| Hook |"));
}

// Cells inside a markdown row, with the leading/trailing pipes removed. An
// escaped pipe (`\|`) inside a cell is not a column separator.
function cells(row: string): string[] {
  const SENTINEL = "\u0000";
  const parts = row.replace(/\\\|/g, SENTINEL).split("|");
  return parts.slice(1, parts.length - 1).map((cell) => cell.replaceAll(SENTINEL, "\\|").trim());
}

const REQUIRED_COLUMNS = [
  "Hook",
  "Host",
  "File path",
  "Event name",
  "Registration file",
  "Blocking semantics",
  "Status",
  "Verified host version + date",
];

function rowsMissingStatus(doc: string): string[] {
  return matrixRows(doc).filter((row) => {
    const columns = cells(row);
    return columns.length !== REQUIRED_COLUMNS.length || !STATUS.test(columns[6] ?? "");
  });
}

describe("hooks-portability.md covers every hook copy", () => {
  const doc = read(DOC);

  test("the doc exists and carries a non-empty matrix", () => {
    // Guard: an empty or moved doc must fail, not vacuously pass the checks.
    expect(doc.length).toBeGreaterThan(0);
    expect(matrixRows(doc).length).toBeGreaterThan(0);
  });

  test("the matrix header names every required column", () => {
    const header = matrixRows(doc).length > 0 ? doc : "";
    for (const column of REQUIRED_COLUMNS) {
      expect(header).toContain(column);
    }
  });

  test("every hook copy on disk and every registered hook path is listed", () => {
    const required = requiredHookPaths();
    // Guard: the derivation must find hooks, or the check proves nothing.
    expect(required.length).toBeGreaterThan(0);
    expect(missingFromDoc(doc, required)).toEqual([]);
  });

  test("every matrix row names a status", () => {
    expect(rowsMissingStatus(doc)).toEqual([]);
  });

  test("positive control: a planted missing path turns the check red", () => {
    const planted = [...requiredHookPaths(), "hooks/fake-host/phantom.mjs"];
    expect(planted.length).toBeGreaterThan(requiredHookPaths().length);
    expect(missingFromDoc(doc, planted)).toEqual(["hooks/fake-host/phantom.mjs"]);
  });

  test("positive control: a planted blank status turns the check red", () => {
    const rows = matrixRows(doc);
    expect(rows.length).toBeGreaterThan(0);
    // Blank the status cell of the first data row and prove the check sees it.
    const cellsOfFirst = cells(rows[0]!);
    const blanked = `| ${cellsOfFirst.map((cell, index) => (index === 6 ? "" : cell)).join(" | ")} |`;
    const planted = doc.replace(rows[0]!, blanked);
    expect(planted).not.toBe(doc);
    expect(rowsMissingStatus(planted)).toEqual([blanked]);
  });
});
