// Acceptance tests for skills/audit-complexity. No test creates a commit:
// the real-git cases only read this checkout, and each new repository is a `git init` with no commit.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { buildGitArgs, classifyStatus, listDirty } from "../skills/audit-complexity/scripts/inventory.mjs";
import { renderReport, validateReport } from "../skills/audit-complexity/scripts/render-report.mjs";

const TOP = resolve(".");
const INVENTORY = resolve("skills/audit-complexity/scripts/inventory.mjs");
const RENDER = resolve("skills/audit-complexity/scripts/render-report.mjs");
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const COVERAGE = "coverage/lines.txt";

// ---------------------------------------------------------------------------------------------
// Fixtures and helpers. Every expected number in a test is worked out by hand from these literals.

function tempDir(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "audit-complexity-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function report(overrides = {}) {
  return {
    version: 1,
    skill: "audit-complexity",
    scope: {
      root: "demo",
      pathspecs: ["src"],
      exclude: [{ path: "src/vendor", reason: "vendored" }],
      date: "2026-09-30",
      commit: COMMIT,
    },
    lanes: [
      {
        name: "core",
        owner: ["src"],
        files: ["src/app.js", "src/db.js"],
        entries: [
          {
            file: "src/app.js",
            functions: 4,
            fanOut: 3,
            mutableState: { count: 2, locations: [{ line: 5, kind: "global", name: "cache" }] },
            hotFunctions: [
              { name: "route", line: 10, endLine: 40, cyclomatic: 3, decisions: [12, 20], nesting: 1, deepestLine: 20, params: 2 },
            ],
          },
          {
            file: "src/db.js",
            functions: 2,
            fanOut: 1,
            mutableState: { count: 0, locations: [] },
            hotFunctions: [
              { name: "query", line: 3, endLine: 12, cyclomatic: 1, decisions: [], nesting: 0, deepestLine: 3, params: 1 },
            ],
          },
        ],
        skipped: [],
        notes: [],
      },
    ],
    gaps: [{ file: "src/README.md", reason: "not source code" }],
    ...overrides,
  };
}

function inventory(overrides = {}) {
  return {
    version: 1,
    commit: COMMIT,
    pathspecs: ["src"],
    exclude: ["src/vendor"],
    dirty: [],
    files: {
      "src/app.js": { status: "text", lines: 120 },
      "src/db.js": { status: "text", lines: 300 },
      "src/README.md": { status: "text", lines: 900 },
      "src/logo.png": { status: "binary", lines: 0 },
    },
    ...overrides,
  };
}

function entry(file, overrides = {}) {
  return { file, functions: 0, fanOut: 0, mutableState: { count: 0, locations: [] }, hotFunctions: [], ...overrides };
}

function lane(name, entries) {
  return { name, owner: ["src"], files: entries.map((e) => e.file), entries, skipped: [], notes: [] };
}

function textFile(lines) {
  return { status: "text", lines };
}

function hot(name, line, cyclomatic, extra = {}) {
  const decisions = Array.from({ length: cyclomatic - 1 }, () => line + 1);
  return { name, line, endLine: line + 5, cyclomatic, decisions, nesting: 1, deepestLine: line + 1, params: 1, ...extra };
}

// Sets scope.coverage on a report() result, as the skill does when --coverage names a file.
function withCoverage(audit) {
  audit.scope.coverage = COVERAGE;
  return audit;
}

// A hot function whose coverage lists `hit` executed lines, then `missed` unexecuted lines, right after `line`.
function covered(name, line, cyclomatic, { hit, missed, crap }) {
  const run = (from, count) => Array.from({ length: count }, (_, i) => from + i);
  return hot(name, line, cyclomatic, {
    endLine: line + hit + missed,
    coverage: { hit: run(line + 1, hit), missed: run(line + 1 + hit, missed) },
    crap,
  });
}

// report() with a coverage file. route (cyclomatic 4) misses 1 of its 4 coverable lines:
// CRAP = 4^2 x (1/4)^3 + 4 = 16/64 + 4 = 4.25. No record matches src/db.js.
function coveredReport() {
  const audit = withCoverage(report());
  audit.lanes[0].entries[0].hotFunctions = [
    {
      name: "route", line: 10, endLine: 40, cyclomatic: 4, decisions: [12, 20, 30], nesting: 1, deepestLine: 20, params: 2,
      coverage: { hit: [12, 20, 30], missed: [35] }, crap: 4.25,
    },
  ];
  audit.lanes[0].entries[1].hotFunctions[0].coverage = { reason: "no coverage record for this file" };
  return audit;
}
const coveredInventory = () => inventory({ coverage: COVERAGE });

// 26 lane files with no hot function; src/f00.js has the fewest lines (1), so the 25-row cap omits it.
const MANY_FILES = Array.from({ length: 26 }, (_, i) => `src/f${String(i).padStart(2, "0")}.js`);
const manyFilesReport = () => report({ lanes: [lane("many", MANY_FILES.map((file) => entry(file)))], gaps: [] });
const manyFilesInventory = () => inventory({ files: Object.fromEntries(MANY_FILES.map((file, i) => [file, textFile(i + 1)])) });

// 26 hot functions, at most 6 per file; fn00 has the lowest cyclomatic (2), so the 25-row cap omits it.
// With full coverage each CRAP equals its cyclomatic value, so fn00 also has the lowest CRAP (2).
const MANY_FUNCTION_FILES = ["src/g0.js", "src/g1.js", "src/g2.js", "src/g3.js", "src/g4.js"];
const manyFunctionsReport = () =>
  report({
    lanes: [
      lane(
        "many",
        MANY_FUNCTION_FILES.map((file, f) =>
          entry(file, {
            functions: 6,
            hotFunctions: Array.from({ length: 6 }, (_, k) => f * 6 + k)
              .filter((i) => i < 26)
              .map((i) => hot(`fn${String(i).padStart(2, "0")}`, 1 + (i % 6) * 10, i + 2)),
          }),
        ),
      ),
    ],
    gaps: [],
  });
const manyFunctionsInventory = () => inventory({ files: Object.fromEntries(MANY_FUNCTION_FILES.map((file) => [file, textFile(100)])) });
const manyScoredReport = () => {
  const audit = withCoverage(manyFunctionsReport());
  for (const fn of audit.lanes[0].entries.flatMap((e) => e.hotFunctions)) {
    Object.assign(fn, { coverage: { hit: [fn.line + 1], missed: [] }, crap: fn.cyclomatic });
  }
  return audit;
};

// One file: src/full.js, cyclomatic 1, 199 of 200 coverable lines hit. 199 x 100 / 200 = 99.5, floored to 99%.
const NEARLY_FULL = { hit: Array.from({ length: 199 }, (_, i) => i + 2), missed: [201] };

// The text from the `## <heading>` line up to the next `## ` heading, or "" when absent.
function section(markdown, heading) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.toLowerCase().startsWith(`## ${heading.toLowerCase()}`));
  if (start === -1) return "";
  const end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

// The text from the `### <heading>` line up to the next heading of any level, or "" when absent.
function subsection(text, heading) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.toLowerCase().startsWith(`### ${heading.toLowerCase()}`));
  if (start === -1) return "";
  const end = lines.findIndex((line, i) => i > start && line.startsWith("#"));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

// The Change risk section without its Not scored subsection: the ranked table and its notes.
const rankedChangeRisk = (markdown) => section(markdown, "Change risk").split("\n### ")[0];

// Every `## ` heading of the report, in order, without the `## ` prefix.
const level2Headings = (markdown) =>
  markdown
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3));

const isSeparator = (line) => /^\|(\s*:?-+:?\s*\|)+\s*$/.test(line);

// Data rows of every Markdown table in `text`, without header and separator rows.
function tableRows(text) {
  const lines = text.split("\n");
  return lines.filter((line, i) => line.startsWith("|") && !isSeparator(line) && !isSeparator(lines[i + 1] ?? ""));
}

const cellsOf = (line) =>
  line
    .replace(/^\|/, "")
    .replace(/\|\s*$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());

// The per-file row for `file`, as { header: cell }, from any table whose header has a Fan-out column.
function perFileRow(markdown, file) {
  const lines = markdown.split("\n");
  let headers = null;
  for (let i = 0; i < lines.length; i += 1) {
    if (isSeparator(lines[i + 1] ?? "") && /fan-?out/i.test(lines[i])) headers = cellsOf(lines[i]);
    else if (!lines[i].startsWith("|")) headers = null;
    else if (headers && !isSeparator(lines[i]) && cellsOf(lines[i]).some((cell) => cell.replace(/`/g, "") === file)) {
      const cells = cellsOf(lines[i]);
      return Object.fromEntries(headers.map((header, k) => [header, cells[k]]));
    }
  }
  return {};
}

// Every data row of every Markdown table in `text`, as { header: cell }, in order.
function rowObjects(text) {
  const lines = text.split("\n");
  const rows = [];
  let headers = null;
  for (let i = 0; i < lines.length; i += 1) {
    if (isSeparator(lines[i + 1] ?? "")) headers = cellsOf(lines[i]);
    else if (!lines[i].startsWith("|")) headers = null;
    else if (headers && !isSeparator(lines[i])) {
      const cells = cellsOf(lines[i]);
      rows.push(Object.fromEntries(headers.map((header, k) => [header, cells[k]])));
    }
  }
  return rows;
}

// The first table row in `text` with a cell that reads `key`, backticks aside, or {} when none does.
const rowWith = (text, key) => rowObjects(text).find((row) => Object.values(row).some((cell) => cell?.replace(/`/g, "") === key)) ?? {};

const column = (row, pattern) => row[Object.keys(row).find((header) => pattern.test(header))];
const lineMatching = (text, pattern) => text.split("\n").find((line) => pattern.test(line)) ?? "";
const missing = (argv, flags) => flags.filter((flag) => !argv.includes(flag));
const afterDashes = (argv) => (argv.includes("--") ? argv.slice(argv.indexOf("--") + 1) : ["<no -->"]);

function auditRequest(pathspecs, extraScope = {}) {
  return JSON.stringify({
    version: 1,
    skill: "audit-complexity",
    scope: { root: "team", pathspecs, exclude: [], date: "2026-09-30", ...extraScope },
  });
}

// Git sees only the config file named here, never the developer's own.
function isolatedGitEnv(configFile, extra = {}) {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: configFile, ...extra };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  return env;
}

function runInventory(reportPath, { cwd, env }) {
  return spawnSync(process.execPath, [INVENTORY, reportPath], { cwd, env, encoding: "utf8" });
}

function runRender(reportPath) {
  return spawnSync(process.execPath, [RENDER, reportPath], { encoding: "utf8" });
}

// ---------------------------------------------------------------------------------------------
// /audit-complexity ranks where complexity concentrates

test("inventory.json is identical from the top level and from docs/", (t) => {
  const dir = tempDir(t);
  mkdirSync(join(dir, "top"));
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "top", "report.json"), auditRequest(["docs"]));
  writeFileSync(join(dir, "docs", "report.json"), auditRequest(["docs"]));
  writeFileSync(join(dir, "empty.gitconfig"), "");
  // diff.relative makes an unanchored git diff print docs/-relative paths.
  writeFileSync(join(dir, "relative.gitconfig"), "[diff]\n\trelative = true\n");

  const fromTop = runInventory(join(dir, "top", "report.json"), { cwd: TOP, env: isolatedGitEnv(join(dir, "empty.gitconfig")) });
  const fromDocs = runInventory(join(dir, "docs", "report.json"), {
    cwd: join(TOP, "docs"),
    env: isolatedGitEnv(join(dir, "relative.gitconfig")),
  });

  assert.equal(fromTop.status, 0, fromTop.stderr);
  assert.equal(fromDocs.status, 0, fromDocs.stderr);
  assert.ok(existsSync(join(dir, "top", "inventory.json")), "the top-level run wrote no inventory.json");
  assert.ok(existsSync(join(dir, "docs", "inventory.json")), "the docs/ run wrote no inventory.json");
  const topBytes = readFileSync(join(dir, "top", "inventory.json"), "utf8");
  assert.equal(readFileSync(join(dir, "docs", "inventory.json"), "utf8"), topBytes);
  const written = JSON.parse(topBytes);
  assert.equal(written.files["docs/skills.md"]?.status, "text");
  assert.ok(written.files["docs/skills.md"]?.lines >= 1, "docs/skills.md has no lines");
});

test("validateReport rejects an inconsistent join", async (t) => {
  await t.test("a complete report has no errors", () => {
    assert.deepEqual(validateReport(report(), inventory()), []);
  });

  await t.test("a wrong skill", () => {
    const errors = validateReport(report({ skill: "audit-tests" }), inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /skill/);
  });

  await t.test("a wrong report.json version", () => {
    const errors = validateReport(report({ version: 2 }), inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /version/);
  });

  await t.test("a wrong inventory.json version", () => {
    const errors = validateReport(report(), inventory({ version: 2 }));
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /inventory/);
    assert.match(errors[0], /version/);
  });

  await t.test("a HEAD that moved between inventory and assembly", () => {
    const broken = report();
    broken.scope.commit = "fedcba9876543210fedcba9876543210fedcba98";
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /commit/);
  });

  await t.test("a pathspec mismatch", () => {
    const errors = validateReport(report(), inventory({ pathspecs: ["lib"] }));
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /pathspec/);
  });

  await t.test("an exclusion-path mismatch", () => {
    const errors = validateReport(report(), inventory({ exclude: [] }));
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /exclu/i);
  });

  await t.test("an exclusion that equals a named path", () => {
    const broken = report();
    broken.scope.exclude = [{ path: "src", reason: "vendored" }];
    const errors = validateReport(broken, inventory({ exclude: ["src"] }));
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /exclu/i);
    assert.match(errors[0], /\bsrc\b/);
  });

  await t.test("an exclusion that contains a named path", () => {
    const broken = report();
    broken.scope.pathspecs = ["src/api"];
    broken.scope.exclude = [{ path: "src", reason: "vendored" }];
    const errors = validateReport(broken, inventory({ pathspecs: ["src/api"], exclude: ["src"] }));
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /exclu/i);
    assert.match(errors[0], /src\/api/);
  });

  await t.test("a text file in no lane and no gap", () => {
    const withOrphan = inventory();
    withOrphan.files["src/orphan.js"] = { status: "text", lines: 10 };
    const errors = validateReport(report(), withOrphan);
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /src\/orphan\.js/);
  });

  await t.test("a text file placed twice", () => {
    const broken = report();
    broken.gaps.push({ file: "src/app.js", reason: "not source code" });
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /src\/app\.js/);
  });

  await t.test("a lane file that is not text", () => {
    const broken = report();
    broken.lanes[0].files.push("src/logo.png");
    broken.lanes[0].skipped.push({ file: "src/logo.png", reason: "binary" });
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /src\/logo\.png/);
  });

  await t.test("a gap file that is not text", () => {
    const broken = report();
    broken.gaps.push({ file: "src/logo.png", reason: "not source code" });
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /src\/logo\.png/);
  });

  await t.test("a lane file with both an entry and a skipped record", () => {
    const broken = report();
    broken.lanes[0].skipped.push({ file: "src/db.js", reason: "minified" });
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /src\/db\.js/);
  });

  await t.test("a lane file with neither an entry nor a skipped record", () => {
    const broken = report();
    broken.lanes[0].entries.pop();
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /src\/db\.js/);
  });

  await t.test("a negative count", () => {
    const broken = report();
    broken.lanes[0].entries[0].fanOut = -1;
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /fanOut/);
  });

  await t.test("a non-integer count", () => {
    const broken = report();
    broken.lanes[0].entries[0].mutableState.count = 2.5;
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /count/);
  });

  await t.test("a mutable-state location with an unknown kind", () => {
    const broken = report();
    broken.lanes[0].entries[0].mutableState.locations[0].kind = "local";
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /kind/);
  });

  await t.test("a mutable-state count below its location count", () => {
    const broken = report();
    broken.lanes[0].entries[0].mutableState.count = 0;
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /locations/);
  });

  await t.test("the CLI exits 1, lists each error on its own line, and writes no report.md", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), JSON.stringify(report({ skill: "audit-tests", version: 2 })));
    writeFileSync(join(dir, "inventory.json"), JSON.stringify(inventory()));
    const run = runRender(join(dir, "report.json"));
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^- .*skill/m);
    assert.match(run.stderr, /^- .*version/m);
    assert.equal(existsSync(join(dir, "report.md")), false);
  });
});

test("renderReport ranks files by their highest cyclomatic complexity", async (t) => {
  await t.test("rows run from the highest max cyclomatic down", () => {
    // src/app.js: route has cyclomatic 3; src/db.js: query has cyclomatic 1.
    const rows = tableRows(section(renderReport(report(), inventory()), "Files"));
    assert.equal(rows.length, 2, rows.join("\n"));
    assert.match(rows[0], /src\/app\.js.*\b3\b/);
    assert.match(rows[1], /src\/db\.js.*\b1\b/);
  });

  await t.test("a gap file never ranks, even with the most lines", () => {
    // src/README.md has 900 lines but sits in gaps.
    const files = section(renderReport(report(), inventory()), "Files");
    assert.match(files, /src\/app\.js/);
    assert.doesNotMatch(files, /src\/README\.md/);
  });

  await t.test("equal max cyclomatic ranks by lines, most first", () => {
    const markdown = renderReport(
      report({
        lanes: [
          lane("core", [
            entry("src/a.js", { functions: 1, hotFunctions: [hot("a", 1, 4)] }),
            entry("src/b.js", { functions: 1, hotFunctions: [hot("b", 1, 4)] }),
          ]),
        ],
        gaps: [],
      }),
      inventory({ files: { "src/a.js": textFile(50), "src/b.js": textFile(100) } }),
    );
    const rows = tableRows(section(markdown, "Files"));
    assert.match(rows[0] ?? "", /src\/b\.js/);
    assert.match(rows[1] ?? "", /src\/a\.js/);
  });

  await t.test("equal max cyclomatic and lines rank by path", () => {
    const markdown = renderReport(
      report({ lanes: [lane("core", [entry("src/b.js"), entry("src/a.js")])], gaps: [] }),
      inventory({ files: { "src/b.js": textFile(100), "src/a.js": textFile(100) } }),
    );
    const rows = tableRows(section(markdown, "Files"));
    assert.match(rows[0] ?? "", /src\/a\.js/);
    assert.match(rows[1] ?? "", /src\/b\.js/);
  });

  await t.test("a file with no hot function ranks below one with cyclomatic 1", () => {
    const markdown = renderReport(
      report({
        lanes: [lane("core", [entry("src/big.js"), entry("src/small.js", { functions: 1, hotFunctions: [hot("f", 1, 1)] })])],
        gaps: [],
      }),
      inventory({ files: { "src/big.js": textFile(900), "src/small.js": textFile(10) } }),
    );
    const rows = tableRows(section(markdown, "Files"));
    assert.match(rows[0] ?? "", /src\/small\.js/);
    assert.match(rows[1] ?? "", /src\/big\.js.*\| - \|/);
  });

  await t.test("26 ranked files show 25 rows and the omitted count", () => {
    const files = section(renderReport(manyFilesReport(), manyFilesInventory()), "Files");
    assert.equal(tableRows(files).length, 25);
    assert.doesNotMatch(files, /src\/f00\.js/);
    assert.match(lineMatching(files, /omitted/i), /\b1\b/);
  });
});

// ---------------------------------------------------------------------------------------------
// Function complexity with line evidence

test("validateReport rejects function evidence that does not add up", async (t) => {
  await t.test("cyclomatic that is not decisions.length + 1", () => {
    const broken = report();
    broken.lanes[0].entries[0].hotFunctions[0].cyclomatic = 4;
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /cyclomatic/);
  });

  await t.test("a decision line outside the function", () => {
    const broken = report();
    broken.lanes[0].entries[0].hotFunctions[0].decisions = [12, 41];
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /decision/);
  });

  await t.test("a deepestLine outside the function", () => {
    const broken = report();
    broken.lanes[0].entries[0].hotFunctions[0].deepestLine = 9;
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /deepestLine/);
  });

  await t.test("an endLine past the file's line count", () => {
    const broken = report();
    broken.lanes[0].entries[0].hotFunctions[0].endLine = 121;
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /endLine/);
  });

  await t.test("7 hot functions", () => {
    const broken = report();
    broken.lanes[0].entries[0].functions = 9;
    broken.lanes[0].entries[0].hotFunctions = [
      hot("a", 10, 1),
      hot("b", 20, 1),
      hot("c", 30, 1),
      hot("d", 40, 1),
      hot("e", 50, 1),
      hot("f", 60, 1),
      hot("g", 70, 1),
    ];
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /hot/i);
  });

  await t.test("more hot functions than functions", () => {
    const broken = report();
    broken.lanes[0].entries[1].functions = 0;
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /functions/);
  });

  await t.test("a <module> that does not start at line 1", () => {
    const broken = report();
    broken.lanes[0].entries[0].hotFunctions.push({
      name: "<module>", line: 2, endLine: 120, cyclomatic: 2, decisions: [5], nesting: 1, deepestLine: 5, params: 0,
    });
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /<module>/);
  });

  await t.test("a <module> that does not end at the file's last line", () => {
    const broken = report();
    broken.lanes[0].entries[0].hotFunctions.push({
      name: "<module>", line: 1, endLine: 119, cyclomatic: 2, decisions: [5], nesting: 1, deepestLine: 5, params: 0,
    });
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /<module>/);
  });

  await t.test("a <module> with parameters", () => {
    const broken = report();
    broken.lanes[0].entries[0].hotFunctions.push({
      name: "<module>", line: 1, endLine: 120, cyclomatic: 2, decisions: [5], nesting: 1, deepestLine: 5, params: 1,
    });
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /<module>/);
  });

  await t.test("an entry with a valid <module> passes", () => {
    const withModule = report();
    withModule.lanes[0].entries[0].hotFunctions.push({
      name: "<module>", line: 1, endLine: 120, cyclomatic: 2, decisions: [5], nesting: 1, deepestLine: 5, params: 0,
    });
    assert.deepEqual(validateReport(withModule, inventory()), []);
  });

  await t.test("an entry with functions 0 and no hot functions passes", () => {
    const empty = report();
    empty.lanes[0].entries[1].functions = 0;
    empty.lanes[0].entries[1].hotFunctions = [];
    assert.deepEqual(validateReport(empty, inventory()), []);
  });
});

test("renderReport ranks hot functions", async (t) => {
  await t.test("rows rank by cyclomatic, with ties by file and then line", () => {
    const markdown = renderReport(
      report({
        lanes: [
          lane("core", [
            entry("src/db.js", { functions: 1, hotFunctions: [hot("query", 3, 7)] }),
            entry("src/app.js", { functions: 3, hotFunctions: [hot("parse", 80, 7), hot("route", 10, 3), hot("handle", 50, 7)] }),
          ]),
        ],
        gaps: [],
      }),
      inventory({ files: { "src/db.js": textFile(300), "src/app.js": textFile(120) } }),
    );
    const rows = tableRows(section(markdown, "Functions"));
    assert.equal(rows.length, 4, rows.join("\n"));
    assert.match(rows[0], /\bhandle\b/);
    assert.match(rows[1], /\bparse\b/);
    assert.match(rows[2], /\bquery\b/);
    assert.match(rows[3], /\broute\b/);
  });

  await t.test("26 hot functions show 25 rows and the omitted count", () => {
    const functions = section(renderReport(manyFunctionsReport(), manyFunctionsInventory()), "Functions");
    assert.equal(tableRows(functions).length, 25);
    assert.doesNotMatch(functions, /\bfn00\b/);
    assert.match(lineMatching(functions, /omitted/i), /\b1\b/);
  });

  await t.test("the heading warns that a file's fourth-ranked function or lower can be missing", () => {
    assert.match(section(renderReport(report(), inventory()), "Functions"), /fourth or lower/i);
  });

  await t.test("file maxima skip <module> for length and parameters only", () => {
    const withModule = report();
    withModule.lanes[0].entries[0].functions = 5;
    withModule.lanes[0].entries[0].hotFunctions.push({
      name: "<module>", line: 1, endLine: 120, cyclomatic: 9, decisions: [2, 3, 4, 5, 6, 7, 8, 60], nesting: 4, deepestLine: 60, params: 0,
    });
    // route spans lines 10-40 (length 31) with 2 params; <module> has cyclomatic 9 and nesting 4.
    const row = perFileRow(renderReport(withModule, inventory()), "src/app.js");
    assert.equal(column(row, /cyclomatic/i), "9");
    assert.equal(column(row, /nesting/i), "4");
    assert.equal(column(row, /length/i), "31");
    assert.equal(column(row, /param/i), "2");
  });
});

// ---------------------------------------------------------------------------------------------
// CRAP change risk from a coverage file

test("validateReport rejects coverage evidence that does not add up", async (t) => {
  await t.test("a report with coverage evidence has no errors", () => {
    assert.deepEqual(validateReport(coveredReport(), coveredInventory()), []);
  });

  await t.test("a crap within 0.01 of the recount passes", () => {
    const rounded = coveredReport();
    rounded.lanes[0].entries[0].hotFunctions[0].crap = 4.26;
    assert.deepEqual(validateReport(rounded, coveredInventory()), []);
  });

  await t.test("scope.coverage differs from inventory.json coverage", () => {
    const errors = validateReport(coveredReport(), inventory({ coverage: "coverage/other.txt" }));
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /coverage\/other\.txt/);
  });

  await t.test("a hot function carries coverage when no coverage file was given", () => {
    const broken = report();
    broken.lanes[0].entries[0].hotFunctions[0].coverage = { hit: [12], missed: [20] };
    const errors = validateReport(broken, inventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /coverage/);
  });

  await t.test("a hot function lacks coverage when a coverage file was given", () => {
    const broken = coveredReport();
    delete broken.lanes[0].entries[0].hotFunctions[0].coverage;
    delete broken.lanes[0].entries[0].hotFunctions[0].crap;
    const errors = validateReport(broken, coveredInventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /route/);
    assert.match(errors[0], /coverage/);
  });

  await t.test("a <module> that carries coverage", () => {
    const broken = coveredReport();
    broken.lanes[0].entries[0].hotFunctions.push({
      name: "<module>", line: 1, endLine: 120, cyclomatic: 2, decisions: [5], nesting: 1, deepestLine: 5, params: 0,
      coverage: { reason: "no coverage record for this file" },
    });
    const errors = validateReport(broken, coveredInventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /<module>/);
    assert.match(errors[0], /coverage/);
  });

  await t.test("coverage that holds a reason and line lists together", () => {
    const broken = coveredReport();
    broken.lanes[0].entries[0].hotFunctions[0].coverage = { reason: "no coverage record for this file", hit: [12, 20, 30], missed: [35] };
    const errors = validateReport(broken, coveredInventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /reason/);
  });

  await t.test("coverage with an empty reason", () => {
    const broken = coveredReport();
    broken.lanes[0].entries[1].hotFunctions[0].coverage = { reason: "" };
    const errors = validateReport(broken, coveredInventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /reason/);
  });

  await t.test("a coverage line outside the function", () => {
    // route spans lines 10-40.
    const broken = coveredReport();
    broken.lanes[0].entries[0].hotFunctions[0].coverage = { hit: [12, 20, 30], missed: [41] };
    const errors = validateReport(broken, coveredInventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /\b41\b/);
  });

  await t.test("a line in both the hit and missed lists", () => {
    const broken = coveredReport();
    broken.lanes[0].entries[0].hotFunctions[0].coverage = { hit: [12, 20, 30], missed: [30] };
    const errors = validateReport(broken, coveredInventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /\b30\b/);
  });

  await t.test("line lists that hold no line", () => {
    const broken = coveredReport();
    broken.lanes[0].entries[0].hotFunctions[0].coverage = { hit: [], missed: [] };
    broken.lanes[0].entries[0].hotFunctions[0].crap = 4;
    const errors = validateReport(broken, coveredInventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /coverage/);
  });

  await t.test("a crap without line lists", () => {
    const broken = coveredReport();
    broken.lanes[0].entries[1].hotFunctions[0].crap = 1;
    const errors = validateReport(broken, coveredInventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /crap/);
  });

  await t.test("a crap that is not a finite number", () => {
    const broken = coveredReport();
    broken.lanes[0].entries[0].hotFunctions[0].crap = "4.25";
    const errors = validateReport(broken, coveredInventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /crap/);
  });

  await t.test("a crap off by more than 0.01 names the expected value", () => {
    const broken = coveredReport();
    broken.lanes[0].entries[0].hotFunctions[0].crap = 4.27;
    const errors = validateReport(broken, coveredInventory());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /crap/);
    assert.match(errors[0], /4\.25/);
  });
});

test("renderReport ranks scored functions by CRAP under Change risk", async (t) => {
  await t.test("cyclomatic 4 at 0%, 50%, and 100% coverage shows CRAP 20.0, 6.0, and 4.0", () => {
    // 4^2 x 1^3 + 4 = 20; 4^2 x (1/2)^3 + 4 = 6; 4^2 x 0^3 + 4 = 4.
    const markdown = renderReport(
      withCoverage(
        report({
          lanes: [
            lane("core", [
              entry("src/app.js", {
                functions: 3,
                hotFunctions: [
                  covered("untested", 1, 4, { hit: 0, missed: 2, crap: 20 }),
                  covered("half", 10, 4, { hit: 1, missed: 1, crap: 6 }),
                  covered("tested", 20, 4, { hit: 2, missed: 0, crap: 4 }),
                ],
              }),
            ]),
          ],
          gaps: [],
        }),
      ),
      inventory({ coverage: COVERAGE, files: { "src/app.js": textFile(120) } }),
    );
    const changeRisk = section(markdown, "Change risk");
    assert.equal(rowWith(changeRisk, "untested").Coverage, "0%");
    assert.equal(rowWith(changeRisk, "untested").CRAP, "20.0");
    assert.equal(rowWith(changeRisk, "half").Coverage, "50%");
    assert.equal(rowWith(changeRisk, "half").CRAP, "6.0");
    assert.equal(rowWith(changeRisk, "tested").Coverage, "100%");
    assert.equal(rowWith(changeRisk, "tested").CRAP, "4.0");
  });

  await t.test("rows rank by CRAP, then cyclomatic, file, and line", () => {
    // top 20.0 (cyclomatic 4); half 6.0 (cyclomatic 4) before low 6.0 (cyclomatic 2);
    // athree and bthree 3.0 by file; early and late 1.0 in src/a.js by line.
    const markdown = renderReport(
      withCoverage(
        report({
          lanes: [
            lane("core", [
              entry("src/b.js", {
                functions: 2,
                hotFunctions: [covered("low", 1, 2, { hit: 0, missed: 1, crap: 6 }), covered("bthree", 10, 3, { hit: 1, missed: 0, crap: 3 })],
              }),
              entry("src/a.js", {
                functions: 4,
                hotFunctions: [
                  covered("late", 30, 1, { hit: 1, missed: 0, crap: 1 }),
                  covered("early", 20, 1, { hit: 1, missed: 0, crap: 1 }),
                  covered("athree", 10, 3, { hit: 1, missed: 0, crap: 3 }),
                  covered("half", 1, 4, { hit: 1, missed: 1, crap: 6 }),
                ],
              }),
              entry("src/c.js", { functions: 1, hotFunctions: [covered("top", 1, 4, { hit: 0, missed: 2, crap: 20 })] }),
            ]),
          ],
          gaps: [],
        }),
      ),
      inventory({ coverage: COVERAGE, files: { "src/a.js": textFile(50), "src/b.js": textFile(50), "src/c.js": textFile(50) } }),
    );
    const rows = tableRows(rankedChangeRisk(markdown));
    assert.equal(rows.length, 7, rows.join("\n"));
    assert.match(rows[0], /\btop\b/);
    assert.match(rows[1], /\bhalf\b/);
    assert.match(rows[2], /\blow\b/);
    assert.match(rows[3], /\bathree\b/);
    assert.match(rows[4], /\bbthree\b/);
    assert.match(rows[5], /\bearly\b/);
    assert.match(rows[6], /\blate\b/);
  });

  await t.test("26 scored functions show 25 rows and the omitted count", () => {
    const ranked = rankedChangeRisk(renderReport(manyScoredReport(), inventory({ ...manyFunctionsInventory(), coverage: COVERAGE })));
    assert.equal(tableRows(ranked).length, 25);
    assert.doesNotMatch(ranked, /\bfn00\b/);
    assert.match(lineMatching(ranked, /omitted/i), /\b1\b/);
  });

  await t.test("199 of 200 lines hit shows 99%, never 100%", () => {
    const markdown = renderReport(
      withCoverage(
        report({
          lanes: [lane("core", [entry("src/full.js", { functions: 1, hotFunctions: [hot("nearly", 1, 1, { endLine: 201, coverage: NEARLY_FULL, crap: 1 })] })])],
          gaps: [],
        }),
      ),
      inventory({ coverage: COVERAGE, files: { "src/full.js": textFile(201) } }),
    );
    assert.equal(rowWith(section(markdown, "Change risk"), "nearly").Coverage, "99%");
  });

  await t.test("Not scored lists each file with a reason by path, with its count and distinct reasons", () => {
    const markdown = renderReport(
      withCoverage(
        report({
          lanes: [
            lane("core", [
              entry("src/z.js", {
                functions: 2,
                hotFunctions: [
                  hot("zone", 1, 2, { coverage: { reason: "no coverage record for this file" } }),
                  hot("ztwo", 10, 2, { coverage: { reason: "no coverage record for this file" } }),
                ],
              }),
              entry("src/k.js", { functions: 1, hotFunctions: [covered("scored", 1, 2, { hit: 1, missed: 0, crap: 2 })] }),
              entry("src/m.js", {
                functions: 2,
                hotFunctions: [
                  hot("mone", 1, 2, { coverage: { reason: "no coverable line in 1-6" } }),
                  hot("mtwo", 10, 2, { coverage: { reason: "no coverable line in 10-15" } }),
                ],
              }),
            ]),
          ],
          gaps: [],
        }),
      ),
      inventory({ coverage: COVERAGE, files: { "src/z.js": textFile(50), "src/k.js": textFile(50), "src/m.js": textFile(50) } }),
    );
    const rows = rowObjects(subsection(section(markdown, "Change risk"), "Not scored"));
    assert.equal(rows.length, 2, JSON.stringify(rows));
    assert.match(rows[0].File, /src\/m\.js/);
    assert.equal(rows[0].Count, "2");
    assert.match(rows[0].Reasons, /no coverable line in 1-6.*no coverable line in 10-15/);
    assert.match(rows[1].File, /src\/z\.js/);
    assert.equal(rows[1].Count, "2");
    assert.equal(rows[1].Reasons, "no coverage record for this file");
  });

  await t.test("without coverage the section says Not run and shows no number", () => {
    const changeRisk = section(renderReport(report(), inventory()), "Change risk");
    assert.match(changeRisk, /Not run: no coverage file was given\./);
    assert.doesNotMatch(changeRisk, /\d/);
  });

  await t.test("without coverage the six existing sections keep their order, with Change risk after Functions", () => {
    const headings = level2Headings(renderReport(report(), inventory()));
    assert.deepEqual(headings.slice(0, 7), ["Summary", "Files", "Functions", "Change risk", "Lanes", "Gaps", "Not measured"]);
  });
});

// ---------------------------------------------------------------------------------------------
// The inventory reads git under any config

test("buildGitArgs pins every parsed output", async (t) => {
  const calls = buildGitArgs({ pathspecs: ["src", "app/[id]"], exclude: ["src/vendor"] });

  await t.test("diff carries every pin", () => {
    assert.deepEqual(calls.diff.slice(0, calls.diff.indexOf("diff") + 1), [
      "--no-optional-locks",
      "-c",
      "diff.autoRefreshIndex=true",
      "diff",
    ]);
    assert.deepEqual(
      missing(calls.diff, ["-z", "--name-only", "--no-renames", "--no-color", "--ignore-submodules=untracked", "HEAD"]),
      [],
    );
  });

  await t.test("every path-listing call passes -z", () => {
    assert.equal(calls.lsFiles.length, 2);
    assert.ok(calls.lsFiles[0].includes("-z"), "ls-files for src lacks -z");
    assert.ok(calls.lsFiles[1].includes("-z"), "ls-files for app/[id] lacks -z");
    assert.ok(calls.diff.includes("-z"), "diff lacks -z");
  });

  await t.test("every call starts with --no-optional-locks", () => {
    assert.deepEqual(calls.topLevel, ["--no-optional-locks", "rev-parse", "--show-toplevel"]);
    assert.deepEqual(calls.head, ["--no-optional-locks", "rev-parse", "--verify", "HEAD"]);
    assert.equal(calls.lsFiles.length, 2);
    assert.equal(calls.lsFiles[0][0], "--no-optional-locks");
    assert.equal(calls.lsFiles[1][0], "--no-optional-locks");
    assert.equal(calls.diff[0], "--no-optional-locks");
  });

  await t.test("literal pathspecs and exclusions follow -- on ls-files only", () => {
    assert.equal(calls.lsFiles.length, 2);
    assert.deepEqual(missing(calls.lsFiles[0], ["ls-files", "--stage"]), []);
    assert.deepEqual(afterDashes(calls.lsFiles[0]), [":(literal)src", ":(exclude,literal)src/vendor"]);
    assert.deepEqual(afterDashes(calls.lsFiles[1]), [":(literal)app/[id]", ":(exclude,literal)src/vendor"]);
    assert.deepEqual(afterDashes(calls.diff), []);
  });
});

test("listDirty lists the inventory paths that differ from HEAD", () => {
  // src/old.js -> src/new.js is a staged rename, listed as both names; docs/out.md is outside the inventory.
  const dirty = listDirty("src/a.js\0src/old.js\0src/new.js\0docs/out.md\0", ["src/a.js", "src/b.js", "src/new.js"]);
  assert.deepEqual(dirty, ["src/a.js", "src/new.js"]);
});

// ---------------------------------------------------------------------------------------------
// Every tracked path is accounted for, and unsafe targets are refused

test("classifyStatus returns each status", async (t) => {
  await t.test("text, with lines counting an unterminated last line", async (st) => {
    const top = tempDir(st);
    writeFileSync(join(top, "a.js"), "one\ntwo\nthree");
    const result = await classifyStatus(top, "a.js", "100644");
    assert.equal(result?.status, "text");
    assert.equal(result?.lines, 3);
  });

  await t.test("binary for a NUL byte", async (st) => {
    const top = tempDir(st);
    writeFileSync(join(top, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));
    assert.equal((await classifyStatus(top, "logo.png", "100644"))?.status, "binary");
  });

  await t.test("missing for ENOENT", async (st) => {
    const top = tempDir(st);
    assert.equal((await classifyStatus(top, "gone.js", "100644"))?.status, "missing");
  });

  await t.test("missing for ENOTDIR", async (st) => {
    const top = tempDir(st);
    writeFileSync(join(top, "file.txt"), "x\n");
    assert.equal((await classifyStatus(top, "file.txt/child.js", "100644"))?.status, "missing");
  });

  await t.test("symlink for index mode 120000", async (st) => {
    const top = tempDir(st);
    writeFileSync(join(top, "a.js"), "one\n");
    assert.equal((await classifyStatus(top, "a.js", "120000"))?.status, "symlink");
  });

  await t.test("symlink for a work-tree symlink under index mode 100644", async (st) => {
    const top = tempDir(st);
    writeFileSync(join(top, "target.js"), "one\n");
    symlinkSync("target.js", join(top, "link.js"));
    assert.equal((await classifyStatus(top, "link.js", "100644"))?.status, "symlink");
  });

  await t.test("symlink for a file under a symlinked parent directory", async (st) => {
    const root = tempDir(st);
    mkdirSync(join(root, "top"));
    mkdirSync(join(root, "outside"));
    writeFileSync(join(root, "outside", "secret.txt"), "secret\n");
    symlinkSync(join(root, "outside"), join(root, "top", "linkdir"));
    assert.equal((await classifyStatus(join(root, "top"), "linkdir/secret.txt", "100644"))?.status, "symlink");
  });

  await t.test("submodule for index mode 160000", async (st) => {
    const top = tempDir(st);
    mkdirSync(join(top, "vendor", "lib"), { recursive: true });
    assert.equal((await classifyStatus(top, "vendor/lib", "160000"))?.status, "submodule");
  });

  await t.test("unreadable for a directory", async (st) => {
    const top = tempDir(st);
    mkdirSync(join(top, "somedir"));
    assert.equal((await classifyStatus(top, "somedir", "100644"))?.status, "unreadable");
  });
});

test("renderReport lists every non-text path under Not measured with its status", () => {
  const withStatuses = inventory();
  withStatuses.files["src/gone.js"] = { status: "missing", lines: 0 };
  withStatuses.files["vendor/lib"] = { status: "submodule", lines: 0 };
  withStatuses.files["src/link.js"] = { status: "symlink", lines: 0 };
  withStatuses.files["src/fifo"] = { status: "unreadable", lines: 0 };
  const notMeasured = section(renderReport(report(), withStatuses), "Not measured");
  assert.match(notMeasured, /src\/logo\.png.*binary/);
  assert.match(notMeasured, /src\/gone\.js.*missing/);
  assert.match(notMeasured, /vendor\/lib.*submodule/);
  assert.match(notMeasured, /src\/link\.js.*symlink/);
  assert.match(notMeasured, /src\/fifo.*unreadable/);
  assert.doesNotMatch(notMeasured, /src\/app\.js/);
});

test("both CLIs exit 1 and write nothing", async (t) => {
  await t.test("inventory.mjs with a malformed report.json", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), "{ not json");
    writeFileSync(join(dir, "empty.gitconfig"), "");
    const run = runInventory(join(dir, "report.json"), { cwd: TOP, env: isolatedGitEnv(join(dir, "empty.gitconfig")) });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^inventory\.mjs: /);
    assert.equal(existsSync(join(dir, "inventory.json")), false);
  });

  await t.test("inventory.mjs outside any work tree", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), auditRequest(["."]));
    writeFileSync(join(dir, "empty.gitconfig"), "");
    const run = runInventory(join(dir, "report.json"), {
      cwd: dir,
      env: isolatedGitEnv(join(dir, "empty.gitconfig"), { GIT_CEILING_DIRECTORIES: dirname(dir) }),
    });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^inventory\.mjs: /);
    assert.equal(existsSync(join(dir, "inventory.json")), false);
  });

  await t.test("inventory.mjs in a repository with no commit", (st) => {
    const dir = tempDir(st);
    mkdirSync(join(dir, "repo"));
    mkdirSync(join(dir, "out"));
    writeFileSync(join(dir, "empty.gitconfig"), "");
    const env = isolatedGitEnv(join(dir, "empty.gitconfig"));
    const init = spawnSync("git", ["init", "-q"], { cwd: join(dir, "repo"), env, encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    writeFileSync(join(dir, "out", "report.json"), auditRequest(["."]));
    const run = runInventory(join(dir, "out", "report.json"), { cwd: join(dir, "repo"), env });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^inventory\.mjs: /);
    assert.equal(existsSync(join(dir, "out", "inventory.json")), false);
  });

  await t.test("inventory.mjs with a named path that matches nothing names it", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), auditRequest(["audit-complexity-no-such-path"]));
    writeFileSync(join(dir, "empty.gitconfig"), "");
    const run = runInventory(join(dir, "report.json"), { cwd: TOP, env: isolatedGitEnv(join(dir, "empty.gitconfig")) });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^inventory\.mjs: .*audit-complexity-no-such-path/);
    assert.equal(existsSync(join(dir, "inventory.json")), false);
  });

  await t.test("inventory.mjs at a symlinked inventory.json", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), auditRequest(["docs/skills.md"]));
    writeFileSync(join(dir, "empty.gitconfig"), "");
    writeFileSync(join(dir, "victim.json"), "original\n");
    symlinkSync(join(dir, "victim.json"), join(dir, "inventory.json"));
    const run = runInventory(join(dir, "report.json"), { cwd: TOP, env: isolatedGitEnv(join(dir, "empty.gitconfig")) });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^inventory\.mjs: .*inventory\.json/);
    assert.equal(readFileSync(join(dir, "victim.json"), "utf8"), "original\n");
  });

  await t.test("render-report.mjs at a symlinked report.md", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), JSON.stringify(report()));
    writeFileSync(join(dir, "inventory.json"), JSON.stringify(inventory()));
    writeFileSync(join(dir, "victim.md"), "original\n");
    symlinkSync(join(dir, "victim.md"), join(dir, "report.md"));
    const run = runRender(join(dir, "report.json"));
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^render-report\.mjs: .*report\.md/);
    assert.equal(readFileSync(join(dir, "victim.md"), "utf8"), "original\n");
  });
});

test("inventory.mjs checks and copies scope.coverage", async (t) => {
  await t.test("a tracked coverage file is copied into inventory.json", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), auditRequest(["docs/skills.md"], { coverage: "docs/skills.md" }));
    writeFileSync(join(dir, "empty.gitconfig"), "");
    const run = runInventory(join(dir, "report.json"), { cwd: TOP, env: isolatedGitEnv(join(dir, "empty.gitconfig")) });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(readFileSync(join(dir, "inventory.json"), "utf8")).coverage, "docs/skills.md");
  });

  await t.test("an absent scope.coverage writes no coverage key", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), auditRequest(["docs/skills.md"]));
    writeFileSync(join(dir, "empty.gitconfig"), "");
    const run = runInventory(join(dir, "report.json"), { cwd: TOP, env: isolatedGitEnv(join(dir, "empty.gitconfig")) });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(Object.hasOwn(JSON.parse(readFileSync(join(dir, "inventory.json"), "utf8")), "coverage"), false);
  });

  await t.test("a non-string scope.coverage exits 1", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), auditRequest(["docs/skills.md"], { coverage: 42 }));
    writeFileSync(join(dir, "empty.gitconfig"), "");
    const run = runInventory(join(dir, "report.json"), { cwd: TOP, env: isolatedGitEnv(join(dir, "empty.gitconfig")) });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^inventory\.mjs: .*scope\.coverage/);
    assert.equal(existsSync(join(dir, "inventory.json")), false);
  });

  await t.test("an absolute scope.coverage exits 1, even when it names a tracked file", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), auditRequest(["docs/skills.md"], { coverage: join(TOP, "docs/skills.md") }));
    writeFileSync(join(dir, "empty.gitconfig"), "");
    const run = runInventory(join(dir, "report.json"), { cwd: TOP, env: isolatedGitEnv(join(dir, "empty.gitconfig")) });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^inventory\.mjs: .*scope\.coverage/);
    assert.equal(existsSync(join(dir, "inventory.json")), false);
  });

  await t.test("a scope.coverage with a .. segment exits 1, even when it resolves to a tracked file", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), auditRequest(["docs/skills.md"], { coverage: "docs/../docs/skills.md" }));
    writeFileSync(join(dir, "empty.gitconfig"), "");
    const run = runInventory(join(dir, "report.json"), { cwd: TOP, env: isolatedGitEnv(join(dir, "empty.gitconfig")) });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^inventory\.mjs: .*scope\.coverage/);
    assert.equal(existsSync(join(dir, "inventory.json")), false);
  });

  await t.test("a symlinked coverage file exits 1 and says so", (st) => {
    const dir = tempDir(st);
    mkdirSync(join(dir, "repo"));
    mkdirSync(join(dir, "out"));
    writeFileSync(join(dir, "empty.gitconfig"), "");
    const env = isolatedGitEnv(join(dir, "empty.gitconfig"));
    const init = spawnSync("git", ["init", "-q"], { cwd: join(dir, "repo"), env, encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    writeFileSync(join(dir, "repo", "real.txt"), "src/app.js\n1 0\n");
    symlinkSync("real.txt", join(dir, "repo", "link.txt"));
    writeFileSync(join(dir, "out", "report.json"), auditRequest(["."], { coverage: "link.txt" }));
    const run = runInventory(join(dir, "out", "report.json"), { cwd: join(dir, "repo"), env });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^inventory\.mjs: coverage file link\.txt is a symlink or leaves the top level/);
    assert.equal(existsSync(join(dir, "out", "inventory.json")), false);
  });

  await t.test("an empty coverage file exits 1 and names it", (st) => {
    const dir = tempDir(st);
    mkdirSync(join(dir, "repo"));
    mkdirSync(join(dir, "out"));
    writeFileSync(join(dir, "empty.gitconfig"), "");
    const env = isolatedGitEnv(join(dir, "empty.gitconfig"));
    const init = spawnSync("git", ["init", "-q"], { cwd: join(dir, "repo"), env, encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    writeFileSync(join(dir, "repo", "nothing.txt"), "");
    writeFileSync(join(dir, "out", "report.json"), auditRequest(["."], { coverage: "nothing.txt" }));
    const run = runInventory(join(dir, "out", "report.json"), { cwd: join(dir, "repo"), env });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^inventory\.mjs: .*nothing\.txt/);
    assert.equal(existsSync(join(dir, "out", "inventory.json")), false);
  });
});
