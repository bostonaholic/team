// evals/lib/select.mjs
//
// Diff-based test selection.
//
// Each fixture's frontmatter carries `deps:` (YAML list of globs). The
// selector intersects the union of every case's deps against the
// `git diff --name-only $base...HEAD` set. Any case whose deps match
// at least one changed file is selected. Any change matching a
// GLOBAL_DEPS entry (runner/judge/select internals) triggers a full
// run. `ALL=1` short-circuits to full run. An empty match returns [].
//
// On shallow clone / detached HEAD, getChangedFiles returns null and
// the caller falls back to "run all" with a warning on stderr.
//
// Mock seams (tests):
//   EVALS_FAKE_CHANGED_FILES  comma-separated list, bypasses git
//   EVALS_FAKE_GIT_DIFF_FAIL  simulate non-zero git diff
//   EVALS_FIXTURE_ROOT        override the fixtures root
//   EVALS_BASE                base branch for `git diff`

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { assertRootWithinSafeArea } from "./paths.mjs";

// Files whose changes invalidate every cached selection — touching them
// means every case should run.
export const GLOBAL_DEPS = [
  "evals/lib/run-agent.mjs",
  "evals/lib/judge.mjs",
  "evals/lib/result-store.mjs",
  "evals/lib/select.mjs",
  "evals/lib/runner.mjs",
];

const BASE_BRANCH_FALLBACKS = [
  "origin/main",
  "origin/master",
  "main",
  "master",
];

// ---------------------------------------------------------------------------
// Frontmatter parsing: we need just the `deps:` block. Returns either an
// array of strings (well-formed) or { malformed: true, reason } otherwise.
// ---------------------------------------------------------------------------

function parseDepsFromFrontmatter(text, sourcePath) {
  if (!text.startsWith("---")) {
    return { malformed: true, reason: "no YAML frontmatter", sourcePath };
  }
  const end = text.indexOf("\n---", 3);
  if (end === -1) {
    return { malformed: true, reason: "unterminated frontmatter", sourcePath };
  }
  const block = text.slice(3, end);
  const lines = block.split(/\r?\n/);
  let inDeps = false;
  let depsScalar = null;
  const deps = [];

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (inDeps) {
      const itemMatch = /^\s+-\s+(.*)$/.exec(line);
      if (itemMatch) {
        deps.push(itemMatch[1].trim());
        continue;
      }
      // Anything else at the same or lower indent ends the deps block.
      if (/^[A-Za-z0-9_-]+:/.test(line) || /^\s*$/.test(line)) {
        inDeps = false;
        // fall through to handle this line normally
      } else {
        // Unknown shape inside deps block — treat as malformed.
        return {
          malformed: true,
          reason: "unexpected line inside deps block",
          sourcePath,
        };
      }
    }
    const m = /^deps:\s*(.*)$/.exec(line);
    if (m) {
      const trailing = m[1].trim();
      if (trailing === "") {
        inDeps = true;
      } else {
        depsScalar = trailing;
      }
    }
  }

  if (depsScalar !== null && deps.length === 0) {
    return {
      malformed: true,
      reason: `deps must be a YAML list of strings, got scalar '${depsScalar}'`,
      sourcePath,
    };
  }

  return { deps };
}

// ---------------------------------------------------------------------------
// Bash-glob matcher: supports `*` (one path segment, no `/`) and `**`
// (zero or more segments). Sufficient for the patterns we use in
// fixture frontmatter.
// ---------------------------------------------------------------------------

function globToRegex(pattern) {
  // Escape regex specials except those we replace.
  let out = "^";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // `**` matches any number of path segments (including slashes).
        out += ".*";
        i++;
      } else {
        // `*` matches one segment (no slash).
        out += "[^/]*";
      }
    } else if (/[.+?^${}()|[\]\\]/.test(ch)) {
      out += "\\" + ch;
    } else if (ch === "/") {
      out += "\\/";
    } else {
      out += ch;
    }
  }
  out += "$";
  return new RegExp(out);
}

function depsMatchChangedFile(depsList, changedFiles) {
  for (const pattern of depsList) {
    const re = globToRegex(pattern);
    for (const file of changedFiles) {
      if (re.test(file)) return true;
    }
  }
  return false;
}

function isGlobalDepsHit(changedFiles) {
  for (const file of changedFiles) {
    if (GLOBAL_DEPS.includes(file)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Fixture enumeration.
// ---------------------------------------------------------------------------

function enumerateCases(fixtureRoot) {
  const cases = [];
  if (!existsSync(fixtureRoot)) return cases;
  for (const agentDirent of readdirSync(fixtureRoot, { withFileTypes: true })) {
    if (!agentDirent.isDirectory()) continue;
    const agentName = agentDirent.name;
    const agentDir = join(fixtureRoot, agentName);
    for (const caseDirent of readdirSync(agentDir, { withFileTypes: true })) {
      if (!caseDirent.isDirectory()) continue;
      const caseName = caseDirent.name;
      const caseDir = join(agentDir, caseName);
      const inputPath = join(caseDir, "input.md");
      const groundTruthPath = join(caseDir, "ground-truth.json");
      cases.push({
        agent: agentName,
        caseName,
        caseDir,
        inputPath,
        groundTruthPath,
      });
    }
  }
  return cases;
}

// ---------------------------------------------------------------------------
// Public: getChangedFiles. Returns an array, or null on git failure.
// ---------------------------------------------------------------------------

export function getChangedFiles({ base } = {}) {
  if (process.env.EVALS_FAKE_GIT_DIFF_FAIL === "1") {
    return null;
  }
  if (process.env.EVALS_FAKE_CHANGED_FILES !== undefined) {
    return process.env.EVALS_FAKE_CHANGED_FILES.split(",").filter(Boolean);
  }
  const candidates = [
    base,
    process.env.EVALS_BASE,
    ...BASE_BRANCH_FALLBACKS,
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const out = execFileSync(
        "git",
        ["diff", "--name-only", `${candidate}...HEAD`],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      return out.split("\n").filter(Boolean);
    } catch {
      // Try the next candidate.
      continue;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public: selectCases. Returns the array of cases (each with .agent and
// .caseName) that should run for this changed-file set.
// ---------------------------------------------------------------------------

export function selectCases({ fixtureRoot, changedFiles, all = false } = {}) {
  if (!fixtureRoot) {
    throw new Error("selectCases: fixtureRoot is required");
  }
  const cases = enumerateCases(fixtureRoot);

  // Parse every fixture's deps once. A malformed `deps:` block is a
  // hard error: surface it before any matching work happens.
  const parsedCases = [];
  for (const c of cases) {
    const text = readFileSync(c.inputPath, "utf8");
    const parsed = parseDepsFromFrontmatter(text, c.inputPath);
    if (parsed.malformed) {
      const err = new Error(
        `malformed deps in ${c.inputPath} (${c.caseName}): ${parsed.reason}`,
      );
      err.code = "EMALFORMED_DEPS";
      err.sourcePath = c.inputPath;
      err.caseName = c.caseName;
      throw err;
    }
    parsedCases.push({ ...c, deps: parsed.deps });
  }

  if (all) return parsedCases;
  if (changedFiles === null || changedFiles === undefined) {
    // Caller is signalling "couldn't determine changes": run all.
    return parsedCases;
  }
  if (changedFiles.length === 0) return [];
  if (isGlobalDepsHit(changedFiles)) return parsedCases;

  return parsedCases.filter((c) =>
    depsMatchChangedFile(c.deps, changedFiles),
  );
}

// ---------------------------------------------------------------------------
// CLI: `node select.mjs --print-selected`. Emits selected case directories
// to stdout (one per line). Designed to be consumed by the bash entry
// script and the acceptance tests.
// ---------------------------------------------------------------------------

function runCli(argv) {
  const printSelected = argv.includes("--print-selected");
  const findPrevious = argv.includes("--find-previous");
  if (findPrevious) {
    // Delegated to compare.mjs in slice 4; selector doesn't own it.
    process.stderr.write(
      "--find-previous lives in evals/lib/compare.mjs, not select.mjs\n",
    );
    return 2;
  }
  if (!printSelected) {
    process.stderr.write(
      "usage: node evals/lib/select.mjs --print-selected\n",
    );
    return 2;
  }

  const fixtureRootRaw =
    process.env.EVALS_FIXTURE_ROOT ||
    join(process.cwd(), "evals/fixtures");
  try {
    assertRootWithinSafeArea(fixtureRootRaw, "EVALS_FIXTURE_ROOT");
  } catch (err) {
    process.stderr.write(`selector: ${err.message}\n`);
    return 1;
  }
  const fixtureRoot = resolve(fixtureRootRaw);

  let changedFiles = getChangedFiles({});
  if (changedFiles === null) {
    process.stderr.write(
      "warning: git diff failed (shallow clone / detached HEAD); falling back to running all cases\n",
    );
  }

  const all = process.env.ALL === "1";

  let selected;
  try {
    selected = selectCases({ fixtureRoot, changedFiles, all });
  } catch (err) {
    if (err.code === "EMALFORMED_DEPS") {
      process.stderr.write(`selector: ${err.message}\n`);
      return 1;
    }
    throw err;
  }

  for (const c of selected) {
    process.stdout.write(`${c.agent}/${c.caseName}\n`);
  }
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("select.mjs")) {
  const code = runCli(process.argv.slice(2));
  process.exit(code);
}
