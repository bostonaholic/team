// Acceptance tests for skills/audit-complexity, grouped by slice. No test creates a commit:
// the real-git cases only read this checkout, and the one new repository is a `git init` with no commit.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { buildGitArgs, buildHistory, classifyStatus, parseLog } from "../skills/audit-complexity/scripts/git-history.mjs";
import { renderReport, validateReport } from "../skills/audit-complexity/scripts/render-report.mjs";

const TOP = resolve(".");
const GIT_HISTORY = resolve("skills/audit-complexity/scripts/git-history.mjs");
const RENDER = resolve("skills/audit-complexity/scripts/render-report.mjs");
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

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
      since: null,
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

function history(overrides = {}) {
  return {
    version: 1,
    commit: COMMIT,
    pathspecs: ["src"],
    exclude: ["src/vendor"],
    since: null,
    shallow: false,
    renameDetectionSkipped: false,
    commitsScanned: 40,
    dirty: [],
    files: {
      "src/app.js": { status: "text", lines: 120, commits: 10, authors: 2, coupling: [{ path: "src/db.js", shared: 4 }] },
      "src/db.js": { status: "text", lines: 300, commits: 5, authors: 1, coupling: [] },
      "src/README.md": { status: "text", lines: 900, commits: 30, authors: 3, coupling: [] },
      "src/logo.png": { status: "binary", lines: 0, commits: 2, authors: 1, coupling: [] },
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

function textFile({ commits, lines }) {
  return { status: "text", lines, commits, authors: 1, coupling: [] };
}

function hot(name, line, cyclomatic) {
  const decisions = Array.from({ length: cyclomatic - 1 }, () => line + 1);
  return { name, line, endLine: line + 5, cyclomatic, decisions, nesting: 1, deepestLine: line + 1, params: 1 };
}

// 26 lane files; src/f00.js scores lowest (1 commit x 10 lines), so the 25-row cap omits it.
const MANY_FILES = Array.from({ length: 26 }, (_, i) => `src/f${String(i).padStart(2, "0")}.js`);
const manyFilesReport = () => report({ lanes: [lane("many", MANY_FILES.map((file) => entry(file)))], gaps: [] });
const manyFilesHistory = () =>
  history({ files: Object.fromEntries(MANY_FILES.map((file, i) => [file, textFile({ commits: i + 1, lines: 10 })])) });

// 26 hot functions, at most 6 per file; fn00 has the lowest cyclomatic (2), so the 25-row cap omits it.
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
const manyFunctionsHistory = () =>
  history({ files: Object.fromEntries(MANY_FUNCTION_FILES.map((file) => [file, textFile({ commits: 1, lines: 100 })])) });

// The text from the `## <heading>` line up to the next `## ` heading, or "" when absent.
function section(markdown, heading) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.toLowerCase().startsWith(`## ${heading.toLowerCase()}`));
  if (start === -1) return "";
  const end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

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

const column = (row, pattern) => row[Object.keys(row).find((header) => pattern.test(header))];
const lineMatching = (text, pattern) => text.split("\n").find((line) => pattern.test(line)) ?? "";
const missing = (argv, flags) => flags.filter((flag) => !argv.includes(flag));
const afterDashes = (argv) => (argv.includes("--") ? argv.slice(argv.indexOf("--") + 1) : ["<no -->"]);

function auditRequest(pathspecs) {
  return JSON.stringify({
    version: 1,
    skill: "audit-complexity",
    scope: { root: "team", pathspecs, exclude: [], since: null, date: "2026-09-30" },
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

function runHistory(reportPath, { cwd, env }) {
  return spawnSync(process.execPath, [GIT_HISTORY, reportPath], { cwd, env, encoding: "utf8" });
}

function runRender(reportPath) {
  return spawnSync(process.execPath, [RENDER, reportPath], { encoding: "utf8" });
}

// A value for every Decision 18 key that, unpinned, would change what git-history.mjs parses.
const HOSTILE_GIT_CONFIG = `[diff]
\trenames = false
\trenameLimit = 1
\tignoreSubmodules = all
\tautoRefreshIndex = false
\trelative = true
[log]
\tshowSignature = true
\tshowRoot = false
\tabbrevCommit = true
\tdecorate = full
\tdate = relative
[color]
\tui = always
\tdiff = always
[i18n]
\tlogOutputEncoding = ISO-8859-1
[format]
\tpretty = oneline
[core]
\tquotePath = true
`;

// Layout of one `git log -z --format=%x1e%H%x1f%aN --name-status` record, read from this checkout:
// 0x1E, the 40-hex hash, 0x1F, the author, NUL; then, only when the commit lists files, "\n" and
// one NUL-terminated token per field: `M\0path\0`, or `R096\0old\0new\0` for a rename or copy.
// A merge lists no files, so its record is 0x1E hash 0x1F author NUL. The output ends with NUL.
function record(hash, author, changes) {
  if (changes.length === 0) return `\x1e${hash}\x1f${author}\0`;
  return `\x1e${hash}\x1f${author}\0\n${changes.map((fields) => `${fields.join("\0")}\0`).join("")}`;
}

const H1 = "1111111111111111111111111111111111111111";
const H2 = "2222222222222222222222222222222222222222";
const H3 = "3333333333333333333333333333333333333333";
const H4 = "4444444444444444444444444444444444444444";

// The bytes of commit 6c69bd8c in this checkout, author replaced. It renames skills/version-bump/SKILL.md
// to .claude/skills/version-bump/SKILL.md.
const REAL_RENAME_RECORD =
  "\u001e6c69bd8ca8dd43fbcb27bef5f02180b07f3fd3eb\u001fAuthor One\u0000\nM\u0000.claude-plugin/marketplace.json\u0000M\u0000.claude-plugin/plugin.json\u0000M\u0000.claude/hooks/pre-merge-guard.mjs\u0000R100\u0000.github/scripts/version-bump-required.sh\u0000.claude/scripts/version-bump-required.sh\u0000R096\u0000skills/version-bump/SKILL.md\u0000.claude/skills/version-bump/SKILL.md\u0000M\u0000.codex-plugin/plugin.json\u0000M\u0000AGENTS.md\u0000M\u0000CHANGELOG.md\u0000M\u0000CONTRIBUTING.md\u0000M\u0000docs/architecture.md\u0000M\u0000docs/cross-host-portability.md\u0000M\u0000docs/skills.md\u0000M\u0000docs/versioning.md\u0000M\u0000package.json\u0000M\u0000plugin.json\u0000M\u0000skills/shipit/SKILL.md\u0000M\u0000skills/shipit/references/01-input-acquisition.md\u0000M\u0000skills/shipit/references/02-land-sequence.md\u0000D\u0000skills/version-bump/agents/openai.yaml\u0000A\u0000tests/version-bump-gate.test.mjs\u0000M\u0000tests/version-bump-packaging.test.mjs\u0000";

// git's rename-limit warning under LC_ALL=C, captured from this checkout with `-l1`.
const RENAME_LIMIT_WARNING =
  "warning: exhaustive rename detection was skipped due to too many files.\n" +
  "warning: you may want to set your diff.renameLimit variable to at least 183 and retry the command.\n";

// A 31-file commit: src/a.js, src/b.js, and 29 generated files.
const BIG_COMMIT = record("5555555555555555555555555555555555555555", "Author One", [
  ["M", "src/a.js"],
  ["M", "src/b.js"],
  ...Array.from({ length: 29 }, (_, i) => ["M", `gen/file${i}.js`]),
]);

// ---------------------------------------------------------------------------------------------
// Slice 1: /audit-complexity ranks change hotspots

test("history.json is identical from the top level and from docs/", (t) => {
  const dir = tempDir(t);
  mkdirSync(join(dir, "top"));
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "top", "report.json"), auditRequest(["docs"]));
  writeFileSync(join(dir, "docs", "report.json"), auditRequest(["docs"]));
  writeFileSync(join(dir, "empty.gitconfig"), "");
  // diff.relative makes an unanchored git log print docs/-relative paths.
  writeFileSync(join(dir, "relative.gitconfig"), "[diff]\n\trelative = true\n");

  const fromTop = runHistory(join(dir, "top", "report.json"), { cwd: TOP, env: isolatedGitEnv(join(dir, "empty.gitconfig")) });
  const fromDocs = runHistory(join(dir, "docs", "report.json"), {
    cwd: join(TOP, "docs"),
    env: isolatedGitEnv(join(dir, "relative.gitconfig")),
  });

  assert.equal(fromTop.status, 0, fromTop.stderr);
  assert.equal(fromDocs.status, 0, fromDocs.stderr);
  assert.ok(existsSync(join(dir, "top", "history.json")), "the top-level run wrote no history.json");
  assert.ok(existsSync(join(dir, "docs", "history.json")), "the docs/ run wrote no history.json");
  const topBytes = readFileSync(join(dir, "top", "history.json"), "utf8");
  assert.equal(readFileSync(join(dir, "docs", "history.json"), "utf8"), topBytes);
  const written = JSON.parse(topBytes);
  assert.equal(written.files["docs/skills.md"]?.status, "text");
  assert.ok(written.files["docs/skills.md"]?.commits >= 1, "docs/skills.md has no commits");
  assert.equal(written.since, null);
});

test("validateReport rejects an inconsistent join", async (t) => {
  await t.test("a complete report has no errors", () => {
    assert.deepEqual(validateReport(report(), history()), []);
  });

  await t.test("a wrong skill", () => {
    const errors = validateReport(report({ skill: "audit-tests" }), history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /skill/);
  });

  await t.test("a wrong report.json version", () => {
    const errors = validateReport(report({ version: 2 }), history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /version/);
  });

  await t.test("a wrong history.json version", () => {
    const errors = validateReport(report(), history({ version: 2 }));
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /history/);
    assert.match(errors[0], /version/);
  });

  await t.test("a HEAD that moved between history and assembly", () => {
    const broken = report();
    broken.scope.commit = "fedcba9876543210fedcba9876543210fedcba98";
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /commit/);
  });

  await t.test("a pathspec mismatch", () => {
    const errors = validateReport(report(), history({ pathspecs: ["lib"] }));
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /pathspec/);
  });

  await t.test("an exclusion-path mismatch", () => {
    const errors = validateReport(report(), history({ exclude: [] }));
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /exclu/i);
  });

  await t.test("a since mismatch, a string against null", () => {
    const broken = report();
    broken.scope.since = "2025-01-01";
    const errors = validateReport(broken, history({ since: null }));
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /since/);
  });

  await t.test("an exclusion that equals a named path", () => {
    const broken = report();
    broken.scope.exclude = [{ path: "src", reason: "vendored" }];
    const errors = validateReport(broken, history({ exclude: ["src"] }));
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /exclu/i);
    assert.match(errors[0], /\bsrc\b/);
  });

  await t.test("an exclusion that contains a named path", () => {
    const broken = report();
    broken.scope.pathspecs = ["src/api"];
    broken.scope.exclude = [{ path: "src", reason: "vendored" }];
    const errors = validateReport(broken, history({ pathspecs: ["src/api"], exclude: ["src"] }));
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /exclu/i);
    assert.match(errors[0], /src\/api/);
  });

  await t.test("a text file in no lane and no gap", () => {
    const withOrphan = history();
    withOrphan.files["src/orphan.js"] = { status: "text", lines: 10, commits: 1, authors: 1, coupling: [] };
    const errors = validateReport(report(), withOrphan);
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /src\/orphan\.js/);
  });

  await t.test("a text file placed twice", () => {
    const broken = report();
    broken.gaps.push({ file: "src/app.js", reason: "not source code" });
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /src\/app\.js/);
  });

  await t.test("a lane file that is not text", () => {
    const broken = report();
    broken.lanes[0].files.push("src/logo.png");
    broken.lanes[0].skipped.push({ file: "src/logo.png", reason: "binary" });
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /src\/logo\.png/);
  });

  await t.test("a gap file that is not text", () => {
    const broken = report();
    broken.gaps.push({ file: "src/logo.png", reason: "not source code" });
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /src\/logo\.png/);
  });

  await t.test("a lane file with both an entry and a skipped record", () => {
    const broken = report();
    broken.lanes[0].skipped.push({ file: "src/db.js", reason: "minified" });
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /src\/db\.js/);
  });

  await t.test("a lane file with neither an entry nor a skipped record", () => {
    const broken = report();
    broken.lanes[0].entries.pop();
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /src\/db\.js/);
  });

  await t.test("a negative count", () => {
    const broken = report();
    broken.lanes[0].entries[0].fanOut = -1;
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /fanOut/);
  });

  await t.test("a non-integer count", () => {
    const broken = report();
    broken.lanes[0].entries[0].mutableState.count = 2.5;
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /count/);
  });

  await t.test("a mutable-state location with an unknown kind", () => {
    const broken = report();
    broken.lanes[0].entries[0].mutableState.locations[0].kind = "local";
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /kind/);
  });

  await t.test("a mutable-state count below its location count", () => {
    const broken = report();
    broken.lanes[0].entries[0].mutableState.count = 0;
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /locations/);
  });

  await t.test("the CLI exits 1, lists each error on its own line, and writes no report.md", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), JSON.stringify(report({ skill: "audit-tests", version: 2 })));
    writeFileSync(join(dir, "history.json"), JSON.stringify(history()));
    const run = runRender(join(dir, "report.json"));
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^- .*skill/m);
    assert.match(run.stderr, /^- .*version/m);
    assert.equal(existsSync(join(dir, "report.md")), false);
  });
});

test("renderReport ranks hotspots by commits × lines", async (t) => {
  await t.test("rows run from the highest score down", () => {
    // src/db.js: 5 x 300 = 1500; src/app.js: 10 x 120 = 1200.
    const rows = tableRows(section(renderReport(report(), history()), "Hotspots"));
    assert.equal(rows.length, 2, rows.join("\n"));
    assert.match(rows[0], /src\/db\.js.*\b1500\b/);
    assert.match(rows[1], /src\/app\.js.*\b1200\b/);
  });

  await t.test("a gap file never ranks, even with the highest score", () => {
    // src/README.md scores 30 x 900 = 27000 but sits in gaps.
    const hotspots = section(renderReport(report(), history()), "Hotspots");
    assert.match(hotspots, /src\/app\.js/);
    assert.doesNotMatch(hotspots, /src\/README\.md/);
  });

  await t.test("equal scores rank by path", () => {
    const markdown = renderReport(
      report({ lanes: [lane("core", [entry("src/b.js"), entry("src/a.js")])], gaps: [] }),
      history({ files: { "src/b.js": textFile({ commits: 10, lines: 100 }), "src/a.js": textFile({ commits: 20, lines: 50 }) } }),
    );
    const rows = tableRows(section(markdown, "Hotspots"));
    assert.match(rows[0] ?? "", /src\/a\.js/);
    assert.match(rows[1] ?? "", /src\/b\.js/);
  });

  await t.test("a lane file with score 0 is absent", () => {
    const markdown = renderReport(
      report({ lanes: [lane("core", [entry("src/app.js"), entry("src/new.js")])], gaps: [] }),
      history({ files: { "src/app.js": textFile({ commits: 10, lines: 120 }), "src/new.js": textFile({ commits: 0, lines: 50 }) } }),
    );
    const hotspots = section(markdown, "Hotspots");
    assert.match(hotspots, /src\/app\.js/);
    assert.doesNotMatch(hotspots, /src\/new\.js/);
  });

  await t.test("26 ranked files show 25 rows and the omitted count", () => {
    const hotspots = section(renderReport(manyFilesReport(), manyFilesHistory()), "Hotspots");
    assert.equal(tableRows(hotspots).length, 25);
    assert.doesNotMatch(hotspots, /src\/f00\.js/);
    assert.match(lineMatching(hotspots, /omitted/i), /\b1\b/);
  });

  await t.test("the summary prints the literal since value and commitsScanned", () => {
    const windowed = report();
    windowed.scope.since = "12 months ago";
    const summary = section(renderReport(windowed, history({ since: "12 months ago", commitsScanned: 40 })), "Summary");
    assert.match(summary, /12 months ago/);
    assert.match(summary, /\b40\b/);
  });
});

// ---------------------------------------------------------------------------------------------
// Slice 2: Function complexity with line evidence

test("validateReport rejects function evidence that does not add up", async (t) => {
  await t.test("cyclomatic that is not decisions.length + 1", () => {
    const broken = report();
    broken.lanes[0].entries[0].hotFunctions[0].cyclomatic = 4;
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /cyclomatic/);
  });

  await t.test("a decision line outside the function", () => {
    const broken = report();
    broken.lanes[0].entries[0].hotFunctions[0].decisions = [12, 41];
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /decision/);
  });

  await t.test("a deepestLine outside the function", () => {
    const broken = report();
    broken.lanes[0].entries[0].hotFunctions[0].deepestLine = 9;
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /deepestLine/);
  });

  await t.test("an endLine past the file's line count", () => {
    const broken = report();
    broken.lanes[0].entries[0].hotFunctions[0].endLine = 121;
    const errors = validateReport(broken, history());
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
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /hot/i);
  });

  await t.test("more hot functions than functions", () => {
    const broken = report();
    broken.lanes[0].entries[1].functions = 0;
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /functions/);
  });

  await t.test("a <module> that does not start at line 1", () => {
    const broken = report();
    broken.lanes[0].entries[0].hotFunctions.push({
      name: "<module>", line: 2, endLine: 120, cyclomatic: 2, decisions: [5], nesting: 1, deepestLine: 5, params: 0,
    });
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /<module>/);
  });

  await t.test("a <module> that does not end at the file's last line", () => {
    const broken = report();
    broken.lanes[0].entries[0].hotFunctions.push({
      name: "<module>", line: 1, endLine: 119, cyclomatic: 2, decisions: [5], nesting: 1, deepestLine: 5, params: 0,
    });
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /<module>/);
  });

  await t.test("a <module> with parameters", () => {
    const broken = report();
    broken.lanes[0].entries[0].hotFunctions.push({
      name: "<module>", line: 1, endLine: 120, cyclomatic: 2, decisions: [5], nesting: 1, deepestLine: 5, params: 1,
    });
    const errors = validateReport(broken, history());
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /<module>/);
  });

  await t.test("an entry with a valid <module> passes", () => {
    const withModule = report();
    withModule.lanes[0].entries[0].hotFunctions.push({
      name: "<module>", line: 1, endLine: 120, cyclomatic: 2, decisions: [5], nesting: 1, deepestLine: 5, params: 0,
    });
    assert.deepEqual(validateReport(withModule, history()), []);
  });

  await t.test("an entry with functions 0 and no hot functions passes", () => {
    const empty = report();
    empty.lanes[0].entries[1].functions = 0;
    empty.lanes[0].entries[1].hotFunctions = [];
    assert.deepEqual(validateReport(empty, history()), []);
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
      history({ files: { "src/db.js": textFile({ commits: 1, lines: 300 }), "src/app.js": textFile({ commits: 1, lines: 120 }) } }),
    );
    const rows = tableRows(section(markdown, "Functions"));
    assert.equal(rows.length, 4, rows.join("\n"));
    assert.match(rows[0], /\bhandle\b/);
    assert.match(rows[1], /\bparse\b/);
    assert.match(rows[2], /\bquery\b/);
    assert.match(rows[3], /\broute\b/);
  });

  await t.test("26 hot functions show 25 rows and the omitted count", () => {
    const functions = section(renderReport(manyFunctionsReport(), manyFunctionsHistory()), "Functions");
    assert.equal(tableRows(functions).length, 25);
    assert.doesNotMatch(functions, /\bfn00\b/);
    assert.match(lineMatching(functions, /omitted/i), /\b1\b/);
  });

  await t.test("the heading warns that a file's fourth-ranked function or lower can be missing", () => {
    assert.match(section(renderReport(report(), history()), "Functions"), /fourth or lower/i);
  });

  await t.test("file maxima skip <module> for length and parameters only", () => {
    const withModule = report();
    withModule.lanes[0].entries[0].functions = 5;
    withModule.lanes[0].entries[0].hotFunctions.push({
      name: "<module>", line: 1, endLine: 120, cyclomatic: 9, decisions: [2, 3, 4, 5, 6, 7, 8, 60], nesting: 4, deepestLine: 60, params: 0,
    });
    // route spans lines 10-40 (length 31) with 2 params; <module> has cyclomatic 9 and nesting 4.
    const row = perFileRow(renderReport(withModule, history()), "src/app.js");
    assert.equal(column(row, /cyclomatic/i), "9");
    assert.equal(column(row, /nesting/i), "4");
    assert.equal(column(row, /length/i), "31");
    assert.equal(column(row, /param/i), "2");
  });
});

// ---------------------------------------------------------------------------------------------
// Slice 3: Churn follows renames under any git config

test("parseLog and buildHistory fold renames into the current path", async (t) => {
  await t.test("a committed rename from outside the scope folds into the current path", () => {
    const log = REAL_RENAME_RECORD + record(H1, "Author One", [["M", "skills/version-bump/SKILL.md"]]);
    const built = buildHistory({ log, inventory: [".claude/skills/version-bump/SKILL.md"] });
    assert.equal(built.files[".claude/skills/version-bump/SKILL.md"]?.commits, 2);
  });

  await t.test("a staged rename keeps the old path's history", () => {
    const log = record(H1, "Author One", [["M", "src/old.js"]]) + record(H2, "Author One", [["A", "src/old.js"]]);
    const built = buildHistory({ log, diff: "R100\0src/old.js\0src/new.js\0", inventory: ["src/new.js"] });
    assert.equal(built.files["src/new.js"]?.commits, 2);
  });

  await t.test("a copy starts fresh", () => {
    const log = record(H1, "Author One", [["C100", "src/a.js", "src/b.js"]]) + record(H2, "Author One", [["M", "src/a.js"]]);
    const built = buildHistory({ log, inventory: ["src/a.js", "src/b.js"] });
    assert.equal(built.files["src/b.js"]?.commits, 1);
  });

  await t.test("a merge record adds nothing", () => {
    const log =
      record(H1, "Author One", [["M", "src/a.js"]]) + record(H2, "Author One", []) + record(H3, "Author One", [["M", "src/a.js"]]);
    const built = buildHistory({ log, inventory: ["src/a.js"] });
    assert.equal(built.files["src/a.js"]?.commits, 2);
  });

  await t.test("an A status keeps counting by path", () => {
    // Newest first: modified, re-created, deleted, created.
    const log =
      record(H1, "Author One", [["M", "src/a.js"]]) +
      record(H2, "Author One", [["A", "src/a.js"]]) +
      record(H3, "Author One", [["D", "src/a.js"]]) +
      record(H4, "Author One", [["A", "src/a.js"]]);
    const built = buildHistory({ log, inventory: ["src/a.js"] });
    assert.equal(built.files["src/a.js"]?.commits, 4);
  });

  await t.test("the rename-limit warning sets renameDetectionSkipped", () => {
    const log = record(H1, "Author One", [["M", "src/a.js"]]);
    assert.equal(buildHistory({ log, logStderr: RENAME_LIMIT_WARNING, inventory: ["src/a.js"] }).renameDetectionSkipped, true);
    assert.equal(buildHistory({ log, logStderr: "", inventory: ["src/a.js"] }).renameDetectionSkipped, false);
  });

  await t.test("a non-hex hash throws with a message naming the record", () => {
    assert.throws(() => parseLog(record("not-a-hash", "Author One", [["M", "src/a.js"]])), /not-a-hash/);
  });
});

test("buildGitArgs pins every parsed output", async (t) => {
  const calls = buildGitArgs({ pathspecs: ["src", "app/[id]"], exclude: ["src/vendor"], since: "12 months ago" });

  await t.test("log carries every pin", () => {
    assert.deepEqual(calls.log.slice(0, calls.log.indexOf("log") + 1), ["--no-optional-locks", "-c", "log.showRoot=true", "log"]);
    assert.deepEqual(
      missing(calls.log, [
        "-z",
        "--format=%x1e%H%x1f%aN",
        "--name-status",
        "-M",
        "-l1000",
        "--no-show-signature",
        "--no-color",
        "--ignore-submodules=untracked",
        "--encoding=UTF-8",
        "HEAD",
      ]),
      [],
    );
  });

  await t.test("diff carries every pin", () => {
    assert.deepEqual(calls.diff.slice(0, calls.diff.indexOf("diff") + 1), [
      "--no-optional-locks",
      "-c",
      "diff.autoRefreshIndex=true",
      "diff",
    ]);
    assert.deepEqual(
      missing(calls.diff, ["-z", "--name-status", "-M", "-l1000", "--no-color", "--ignore-submodules=untracked", "HEAD"]),
      [],
    );
  });

  await t.test("every path-listing call passes -z", () => {
    assert.equal(calls.lsFiles.length, 2);
    assert.ok(calls.lsFiles[0].includes("-z"), "ls-files for src lacks -z");
    assert.ok(calls.lsFiles[1].includes("-z"), "ls-files for app/[id] lacks -z");
    assert.ok(calls.diff.includes("-z"), "diff lacks -z");
    assert.ok(calls.log.includes("-z"), "log lacks -z");
  });

  await t.test("every call starts with --no-optional-locks", () => {
    assert.deepEqual(calls.topLevel, ["--no-optional-locks", "rev-parse", "--show-toplevel"]);
    assert.deepEqual(calls.head, ["--no-optional-locks", "rev-parse", "--verify", "HEAD"]);
    assert.deepEqual(calls.shallow, ["--no-optional-locks", "rev-parse", "--is-shallow-repository"]);
    assert.equal(calls.lsFiles.length, 2);
    assert.equal(calls.lsFiles[0][0], "--no-optional-locks");
    assert.equal(calls.lsFiles[1][0], "--no-optional-locks");
    assert.equal(calls.diff[0], "--no-optional-locks");
    assert.equal(calls.log[0], "--no-optional-locks");
  });

  await t.test("literal pathspecs and exclusions follow -- on ls-files only", () => {
    assert.equal(calls.lsFiles.length, 2);
    assert.deepEqual(missing(calls.lsFiles[0], ["ls-files", "--stage"]), []);
    assert.deepEqual(afterDashes(calls.lsFiles[0]), [":(literal)src", ":(exclude,literal)src/vendor"]);
    assert.deepEqual(afterDashes(calls.lsFiles[1]), [":(literal)app/[id]", ":(exclude,literal)src/vendor"]);
    assert.deepEqual(afterDashes(calls.log), []);
    assert.deepEqual(afterDashes(calls.diff), []);
  });

  await t.test("since becomes one --since= element", () => {
    assert.ok(calls.log.includes("--since=12 months ago"), calls.log.join(" "));
  });

  await t.test("a null since adds no --since element", () => {
    const unbounded = buildGitArgs({ pathspecs: ["src"], exclude: [], since: null });
    assert.ok(unbounded.log.includes("log"), unbounded.log.join(" "));
    assert.deepEqual(
      unbounded.log.filter((arg) => arg.startsWith("--since")),
      [],
    );
  });
});

test("buildHistory lists inventory paths that differ from HEAD as dirty", () => {
  // src/a.js is modified and src/new.js is a staged rename target; docs/out.md is outside the inventory.
  const built = buildHistory({
    log: record(H1, "Author One", [["M", "src/a.js"]]),
    diff: "M\0src/a.js\0R100\0src/old.js\0src/new.js\0M\0docs/out.md\0",
    inventory: ["src/a.js", "src/b.js", "src/new.js"],
  });
  assert.deepEqual(built.dirty?.slice().sort(), ["src/a.js", "src/new.js"]);
});

test("renderReport warns that churn is partial", async (t) => {
  await t.test("in a shallow clone", () => {
    const summary = section(renderReport(report(), history({ shallow: true })), "Summary");
    assert.match(summary, /partial/i);
  });

  await t.test("when git skipped rename detection", () => {
    const summary = section(renderReport(report(), history({ renameDetectionSkipped: true })), "Summary");
    assert.match(summary, /partial/i);
  });

  await t.test("not when history is complete", () => {
    const summary = section(renderReport(report(), history({ shallow: false, renameDetectionSkipped: false })), "Summary");
    assert.match(summary, /\b40\b/);
    assert.doesNotMatch(summary, /partial/i);
  });
});

test("history.json is identical under hostile git config", (t) => {
  const dir = tempDir(t);
  mkdirSync(join(dir, "plain"));
  mkdirSync(join(dir, "hostile"));
  writeFileSync(join(dir, "plain", "report.json"), auditRequest(["docs"]));
  writeFileSync(join(dir, "hostile", "report.json"), auditRequest(["docs"]));
  writeFileSync(join(dir, "empty.gitconfig"), "");
  writeFileSync(join(dir, "hostile.gitconfig"), HOSTILE_GIT_CONFIG);

  // docs/ethos.md and docs/vision.md were renamed from the top level, so a lost -M changes their counts.
  const plain = runHistory(join(dir, "plain", "report.json"), { cwd: TOP, env: isolatedGitEnv(join(dir, "empty.gitconfig")) });
  const hostile = runHistory(join(dir, "hostile", "report.json"), { cwd: TOP, env: isolatedGitEnv(join(dir, "hostile.gitconfig")) });

  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(hostile.status, 0, hostile.stderr);
  assert.ok(existsSync(join(dir, "plain", "history.json")), "the plain-config run wrote no history.json");
  assert.ok(existsSync(join(dir, "hostile", "history.json")), "the hostile-config run wrote no history.json");
  const plainBytes = readFileSync(join(dir, "plain", "history.json"), "utf8");
  assert.equal(readFileSync(join(dir, "hostile", "history.json"), "utf8"), plainBytes);
  const written = JSON.parse(plainBytes);
  assert.equal(written.files["docs/skills.md"]?.status, "text");
  assert.ok(written.files["docs/skills.md"]?.commits >= 1, "docs/skills.md has no commits");
  assert.equal(written.since, null);
});

// ---------------------------------------------------------------------------------------------
// Slice 4: Every tracked path is accounted for, and unsafe targets are refused

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
  const withStatuses = history();
  withStatuses.files["src/gone.js"] = { status: "missing", lines: 0, commits: 3, authors: 1, coupling: [] };
  withStatuses.files["vendor/lib"] = { status: "submodule", lines: 0, commits: 1, authors: 1, coupling: [] };
  withStatuses.files["src/link.js"] = { status: "symlink", lines: 0, commits: 1, authors: 1, coupling: [] };
  withStatuses.files["src/fifo"] = { status: "unreadable", lines: 0, commits: 1, authors: 1, coupling: [] };
  const notMeasured = section(renderReport(report(), withStatuses), "Not measured");
  assert.match(notMeasured, /src\/logo\.png.*binary/);
  assert.match(notMeasured, /src\/gone\.js.*missing/);
  assert.match(notMeasured, /vendor\/lib.*submodule/);
  assert.match(notMeasured, /src\/link\.js.*symlink/);
  assert.match(notMeasured, /src\/fifo.*unreadable/);
  assert.doesNotMatch(notMeasured, /src\/app\.js/);
});

test("both CLIs exit 1 and write nothing", async (t) => {
  await t.test("git-history.mjs with a malformed report.json", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), "{ not json");
    writeFileSync(join(dir, "empty.gitconfig"), "");
    const run = runHistory(join(dir, "report.json"), { cwd: TOP, env: isolatedGitEnv(join(dir, "empty.gitconfig")) });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^git-history\.mjs: /);
    assert.equal(existsSync(join(dir, "history.json")), false);
  });

  await t.test("git-history.mjs outside any work tree", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), auditRequest(["."]));
    writeFileSync(join(dir, "empty.gitconfig"), "");
    const run = runHistory(join(dir, "report.json"), {
      cwd: dir,
      env: isolatedGitEnv(join(dir, "empty.gitconfig"), { GIT_CEILING_DIRECTORIES: dirname(dir) }),
    });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^git-history\.mjs: /);
    assert.equal(existsSync(join(dir, "history.json")), false);
  });

  await t.test("git-history.mjs in a repository with no commit", (st) => {
    const dir = tempDir(st);
    mkdirSync(join(dir, "repo"));
    mkdirSync(join(dir, "out"));
    writeFileSync(join(dir, "empty.gitconfig"), "");
    const env = isolatedGitEnv(join(dir, "empty.gitconfig"));
    const init = spawnSync("git", ["init", "-q"], { cwd: join(dir, "repo"), env, encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    writeFileSync(join(dir, "out", "report.json"), auditRequest(["."]));
    const run = runHistory(join(dir, "out", "report.json"), { cwd: join(dir, "repo"), env });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^git-history\.mjs: /);
    assert.equal(existsSync(join(dir, "out", "history.json")), false);
  });

  await t.test("git-history.mjs with a named path that matches nothing names it", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), auditRequest(["audit-complexity-no-such-path"]));
    writeFileSync(join(dir, "empty.gitconfig"), "");
    const run = runHistory(join(dir, "report.json"), { cwd: TOP, env: isolatedGitEnv(join(dir, "empty.gitconfig")) });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^git-history\.mjs: .*audit-complexity-no-such-path/);
    assert.equal(existsSync(join(dir, "history.json")), false);
  });

  await t.test("git-history.mjs at a symlinked history.json", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), auditRequest(["docs/skills.md"]));
    writeFileSync(join(dir, "empty.gitconfig"), "");
    writeFileSync(join(dir, "victim.json"), "original\n");
    symlinkSync(join(dir, "victim.json"), join(dir, "history.json"));
    const run = runHistory(join(dir, "report.json"), { cwd: TOP, env: isolatedGitEnv(join(dir, "empty.gitconfig")) });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^git-history\.mjs: .*history\.json/);
    assert.equal(readFileSync(join(dir, "victim.json"), "utf8"), "original\n");
  });

  await t.test("render-report.mjs at a symlinked report.md", (st) => {
    const dir = tempDir(st);
    writeFileSync(join(dir, "report.json"), JSON.stringify(report()));
    writeFileSync(join(dir, "history.json"), JSON.stringify(history()));
    writeFileSync(join(dir, "victim.md"), "original\n");
    symlinkSync(join(dir, "victim.md"), join(dir, "report.md"));
    const run = runRender(join(dir, "report.json"));
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /^render-report\.mjs: .*report\.md/);
    assert.equal(readFileSync(join(dir, "victim.md"), "utf8"), "original\n");
  });
});

// ---------------------------------------------------------------------------------------------
// Slice 5: Authors and change coupling

test("buildHistory pairs files that change together", async (t) => {
  await t.test("a 31-file commit counts for churn but adds no pair", () => {
    const log =
      BIG_COMMIT +
      record(H1, "Author One", [["M", "src/a.js"], ["M", "src/b.js"]]) +
      record(H2, "Author One", [["M", "src/a.js"], ["M", "src/b.js"]]);
    const built = buildHistory({ log, inventory: ["src/a.js"], partners: ["src/a.js", "src/b.js"] });
    assert.equal(built.files["src/a.js"]?.commits, 3);
    assert.deepEqual(built.files["src/a.js"]?.coupling, []);
  });

  await t.test("3 shared commits make a partner and 2 do not", () => {
    const log =
      record(H1, "Author One", [["M", "src/a.js"], ["M", "src/b.js"], ["M", "src/c.js"]]) +
      record(H2, "Author One", [["M", "src/a.js"], ["M", "src/b.js"], ["M", "src/c.js"]]) +
      record(H3, "Author One", [["M", "src/a.js"], ["M", "src/b.js"]]);
    const built = buildHistory({
      log,
      inventory: ["src/a.js", "src/b.js", "src/c.js"],
      partners: ["src/a.js", "src/b.js", "src/c.js"],
    });
    assert.deepEqual(built.files["src/a.js"]?.coupling, [{ path: "src/b.js", shared: 3 }]);
  });

  await t.test("a partner outside the audited paths stays", () => {
    const log =
      record(H1, "Author One", [["M", "src/a.js"], ["M", "docs/a.md"]]) +
      record(H2, "Author One", [["M", "src/a.js"], ["M", "docs/a.md"]]) +
      record(H3, "Author One", [["M", "src/a.js"], ["M", "docs/a.md"]]);
    const built = buildHistory({ log, inventory: ["src/a.js"], partners: ["src/a.js", "docs/a.md"] });
    assert.deepEqual(built.files["src/a.js"]?.coupling, [{ path: "docs/a.md", shared: 3 }]);
  });

  await t.test("equal partners sort by path and only the top 3 remain", () => {
    // Shared with src/a.js: d 4, and b, c, e 3 each.
    const five = [["M", "src/e.js"], ["M", "src/c.js"], ["M", "src/a.js"], ["M", "src/b.js"], ["M", "src/d.js"]];
    const log =
      record(H1, "Author One", five) +
      record(H2, "Author One", five) +
      record(H3, "Author One", five) +
      record(H4, "Author One", [["M", "src/a.js"], ["M", "src/d.js"]]);
    const built = buildHistory({
      log,
      inventory: ["src/a.js"],
      partners: ["src/a.js", "src/b.js", "src/c.js", "src/d.js", "src/e.js"],
    });
    assert.deepEqual(built.files["src/a.js"]?.coupling, [
      { path: "src/d.js", shared: 4 },
      { path: "src/b.js", shared: 3 },
      { path: "src/c.js", shared: 3 },
    ]);
  });

  await t.test("authors counts distinct names", () => {
    const log =
      record(H1, "Ada Lovelace", [["M", "src/a.js"]]) +
      record(H2, "Grace Hopper", [["M", "src/a.js"]]) +
      record(H3, "Ada Lovelace", [["M", "src/a.js"]]);
    const built = buildHistory({ log, inventory: ["src/a.js"], partners: ["src/a.js"] });
    assert.equal(built.files["src/a.js"]?.authors, 2);
  });

  await t.test("no author name appears in the serialized history", () => {
    const log =
      record(H1, "Ada Lovelace", [["M", "src/a.js"]]) +
      record(H2, "Grace Hopper", [["M", "src/a.js"]]) +
      record(H3, "Ada Lovelace", [["M", "src/a.js"]]);
    const built = buildHistory({ log, inventory: ["src/a.js"], partners: ["src/a.js"] });
    assert.equal(built.files["src/a.js"]?.commits, 3);
    assert.doesNotMatch(JSON.stringify(built), /Ada Lovelace|Grace Hopper/);
  });
});

test("buildGitArgs lists coupling partners with one repo-wide ls-files", () => {
  const calls = buildGitArgs({ pathspecs: ["src"], exclude: ["src/vendor", "dist"], since: null });
  assert.equal(calls.partners[0], "--no-optional-locks");
  assert.deepEqual(missing(calls.partners, ["ls-files", "-z", "--stage"]), []);
  assert.deepEqual(afterDashes(calls.partners), [".", ":(exclude,literal)src/vendor", ":(exclude,literal)dist"]);
});

test("renderReport shows each file's authors and partners", () => {
  // src/app.js: 2 authors, partner src/db.js with 4 shared commits.
  const row = perFileRow(renderReport(report(), history()), "src/app.js");
  assert.equal(column(row, /authors/i), "2");
  assert.match(column(row, /partner/i) ?? "", /src\/db\.js \(4\)/);
});
