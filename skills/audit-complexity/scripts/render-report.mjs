#!/usr/bin/env node
// Joins an audit-complexity report.json with the history.json beside it, validates both, and renders report.md.
// Usage: render-report.mjs <report.json> [<report.md>]
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const MUTATION_KINDS = ["global", "field", "param"];
const TABLE_ROWS = 25;
const MAX_HOT_FUNCTIONS = 6;
const MODULE = "<module>";
const HOT_FUNCTION_COUNTS = ["line", "endLine", "cyclomatic", "nesting", "deepestLine", "params"];

const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isCount = (value) => Number.isInteger(value) && value >= 0;
const sameList = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
const show = (value) => JSON.stringify(value ?? null);

function joinErrors(scope, history) {
  const errors = [];
  if (scope.commit !== history.commit) {
    errors.push(`scope.commit ${show(scope.commit)} does not match history.json commit ${show(history.commit)}. HEAD moved, so rerun the audit`);
  }
  const pathspecs = list(scope.pathspecs);
  if (!sameList(pathspecs, list(history.pathspecs))) {
    errors.push(`scope.pathspecs ${show(pathspecs)} do not match history.json pathspecs ${show(history.pathspecs)}`);
  }
  const excluded = list(scope.exclude).map((record) => record?.path);
  if (!sameList(excluded, list(history.exclude))) {
    errors.push(`scope.exclude paths ${show(excluded)} do not match history.json exclude ${show(history.exclude)}`);
  }
  if ((scope.since ?? null) !== (history.since ?? null) || scope.since === undefined) {
    errors.push(`scope.since ${show(scope.since)} does not match history.json since ${show(history.since)}`);
  }
  for (const exclusion of excluded) {
    for (const named of pathspecs.filter((path) => path === exclusion || path.startsWith(`${exclusion}/`))) {
      errors.push(`exclusion ${exclusion} equals or contains the named path ${named}`);
    }
  }
  return errors;
}

function placementErrors(report, files) {
  const errors = [];
  const placements = new Map(Object.keys(files).filter((path) => files[path]?.status === "text").map((path) => [path, 0]));
  const place = (file, where) => {
    if (placements.has(file)) placements.set(file, placements.get(file) + 1);
    else errors.push(`${where} lists ${file}, which is not a text file in history.json (status ${files[file]?.status ?? "absent"})`);
  };
  for (const lane of list(report.lanes)) for (const file of list(lane.files)) place(file, `lane ${lane.name}`);
  for (const gap of list(report.gaps)) place(gap.file, "gaps");
  for (const [file, count] of placements) {
    if (count === 0) errors.push(`${file} is a text file in no lane and no gap`);
    if (count > 1) errors.push(`${file} is placed ${count} times. Place it exactly once`);
  }
  return errors;
}

function laneRecordErrors(lane) {
  const errors = [];
  const files = list(lane.files);
  const records = [...list(lane.entries), ...list(lane.skipped)].map((record) => record?.file);
  for (const file of files) {
    const count = records.filter((recorded) => recorded === file).length;
    if (count === 0) errors.push(`lane ${lane.name}: ${file} has neither an entry nor a skipped record`);
    if (count > 1) errors.push(`lane ${lane.name}: ${file} has ${count} entries and skipped records. Give it exactly one`);
  }
  for (const file of new Set(records.filter((recorded) => !files.includes(recorded)))) {
    errors.push(`lane ${lane.name}: ${file} has an entry or skipped record but is not in the lane's files`);
  }
  return errors;
}

function hotFunctionErrors(file, hot, lines) {
  const where = `${file}: ${hot.name} at line ${hot.line}`;
  const notCounts = HOT_FUNCTION_COUNTS.filter((field) => !isCount(hot[field]));
  if (notCounts.length > 0) return [`${where}: ${notCounts.join(", ")} must be integers of 0 or more`];
  if (!Array.isArray(hot.decisions) || !hot.decisions.every(isCount)) return [`${where}: decisions must be a list of line numbers`];
  const errors = [];
  const inside = (line) => hot.line <= line && line <= hot.endLine;
  if (hot.line < 1 || hot.endLine < hot.line) errors.push(`${where}: line and endLine must satisfy 1 <= line <= endLine, not ${hot.line}-${hot.endLine}`);
  if (lines !== undefined && hot.endLine > lines) errors.push(`${where}: endLine ${hot.endLine} is past the file's ${lines} lines`);
  if (hot.cyclomatic !== hot.decisions.length + 1) {
    errors.push(`${where}: cyclomatic ${hot.cyclomatic} must equal decisions.length + 1, which is ${hot.decisions.length + 1}`);
  }
  for (const line of hot.decisions.filter((decision) => !inside(decision))) {
    errors.push(`${where}: decision line ${line} falls outside lines ${hot.line}-${hot.endLine}`);
  }
  if (!inside(hot.deepestLine)) errors.push(`${where}: deepestLine ${hot.deepestLine} falls outside lines ${hot.line}-${hot.endLine}`);
  if (hot.name === MODULE) {
    if (hot.line !== 1) errors.push(`${file}: ${MODULE} must start at line 1, not ${hot.line}`);
    if (lines !== undefined && hot.endLine !== lines) errors.push(`${file}: ${MODULE} must end at the file's last line ${lines}, not ${hot.endLine}`);
    if (hot.params !== 0) errors.push(`${file}: ${MODULE} must have params 0, not ${hot.params}`);
  }
  return errors;
}

function entryErrors(entry, files) {
  const errors = [];
  const file = entry.file;
  const state = isObject(entry.mutableState) ? entry.mutableState : {};
  const locations = list(state.locations);
  const hotFunctions = list(entry.hotFunctions);
  if (!isCount(entry.fanOut)) errors.push(`${file}: fanOut must be an integer of 0 or more, not ${show(entry.fanOut)}`);
  if (!isCount(entry.functions)) {
    errors.push(`${file}: functions must be an integer of 0 or more, not ${show(entry.functions)}`);
  } else if (hotFunctions.length > entry.functions) {
    errors.push(`${file}: ${hotFunctions.length} hot functions exceed its ${entry.functions} functions`);
  }
  if (hotFunctions.length > MAX_HOT_FUNCTIONS) {
    errors.push(`${file}: ${hotFunctions.length} hot functions exceed the limit of ${MAX_HOT_FUNCTIONS}`);
  }
  for (const hot of hotFunctions) errors.push(...hotFunctionErrors(file, hot, files[file]?.lines));
  if (!isCount(state.count)) {
    errors.push(`${file}: mutableState.count must be an integer of 0 or more, not ${show(state.count)}`);
  } else if (state.count < locations.length) {
    errors.push(`${file}: mutableState.count ${state.count} is below its ${locations.length} listed locations`);
  }
  for (const location of locations) {
    if (!MUTATION_KINDS.includes(location?.kind)) {
      errors.push(`${file}:${location?.line}: mutable-state kind ${show(location?.kind)} is not ${MUTATION_KINDS.join(", ")}`);
    }
  }
  return errors;
}

export function validateReport(report, history) {
  if (!isObject(report)) return ["report.json is not a JSON object"];
  if (!isObject(history)) return ["history.json is not a JSON object"];
  const errors = [];
  if (report.version !== 1) errors.push(`report.json version must be 1, not ${show(report.version)}`);
  if (report.skill !== "audit-complexity") errors.push(`report.json skill must be audit-complexity, not ${show(report.skill)}`);
  if (history.version !== 1) errors.push(`history.json version must be 1, not ${show(history.version)}`);
  const files = isObject(history.files) ? history.files : {};
  errors.push(...joinErrors(isObject(report.scope) ? report.scope : {}, history));
  errors.push(...placementErrors(report, files));
  for (const lane of list(report.lanes)) {
    errors.push(...laneRecordErrors(lane));
    for (const entry of list(lane.entries)) errors.push(...entryErrors(entry, files));
  }
  return errors;
}

const cell = (value) =>
  String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|");

function table(headers, rows) {
  if (rows.length === 0) return "None.\n";
  const lines = [`| ${headers.join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`];
  for (const row of rows) lines.push(`| ${row.map(cell).join(" | ")} |`);
  return `${lines.join("\n")}\n`;
}

const byPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function capped(rows) {
  const omitted = rows.length - TABLE_ROWS;
  return { shown: rows.slice(0, TABLE_ROWS), note: omitted > 0 ? `${omitted} omitted.\n` : "" };
}

const entriesOf = (report) => list(report.lanes).flatMap((lane) => list(lane.entries));
const lengthOf = (hot) => hot.endLine - hot.line + 1;

// <module> spans the whole file, so it would dominate every length and has no parameters.
function fileMaxima(entry) {
  const hot = list(entry.hotFunctions);
  const functions = hot.filter((fn) => fn.name !== MODULE);
  const max = (values) => (values.length === 0 ? "-" : Math.max(...values));
  return {
    cyclomatic: max(hot.map((fn) => fn.cyclomatic)),
    nesting: max(hot.map((fn) => fn.nesting)),
    length: max(functions.map(lengthOf)),
    params: max(functions.map((fn) => fn.params)),
  };
}

function hotspotRows(report, files) {
  return entriesOf(report)
    .map((entry) => {
      const { commits, lines } = files[entry.file];
      return { file: entry.file, commits, lines, score: commits * lines, cyclomatic: fileMaxima(entry).cyclomatic };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || byPath(a.file, b.file));
}

function renderSummary(report, history) {
  const scope = report.scope;
  const files = Object.values(history.files);
  const lanes = list(report.lanes);
  const exclusions = list(scope.exclude).map((record) => `\`${record.path}\` (${record.reason})`);
  return [
    "## Summary\n",
    `Commit \`${scope.commit}\` on ${scope.date}. Scope: ${list(scope.pathspecs).map((path) => `\`${path}\``).join(", ")}. ` +
      `Excluded: ${exclusions.join(", ") || "none"}.\n`,
    `History window: ${scope.since === null ? "all history" : `since ${scope.since}`}. Commits scanned: ${history.commitsScanned}.\n`,
    table(
      ["Measure", "Count"],
      [
        ["Tracked paths in scope", files.length],
        ["Measured files", lanes.reduce((sum, lane) => sum + list(lane.entries).length, 0)],
        ["Skipped by analysts", lanes.reduce((sum, lane) => sum + list(lane.skipped).length, 0)],
        ["Gaps", list(report.gaps).length],
        ["Not measured", files.filter((file) => file.status !== "text").length],
      ],
    ),
  ];
}

function renderHotspots(report, files) {
  const { shown, note } = capped(hotspotRows(report, files));
  return [
    "## Hotspots\n",
    "Score is commits × lines. Only measured lane files rank, and equal scores rank by path. " +
      "Max cyclomatic is estimated by reading.\n",
    table(
      ["Rank", "File", "Commits", "Lines", "Score", "Max cyclomatic"],
      shown.map((row, i) => [i + 1, `\`${row.file}\``, row.commits, row.lines, row.score, row.cyclomatic]),
    ),
    note,
  ];
}

function renderFunctions(report) {
  const ranked = entriesOf(report)
    .flatMap((entry) => list(entry.hotFunctions).map((hot) => ({ file: entry.file, ...hot })))
    .sort((a, b) => b.cyclomatic - a.cyclomatic || byPath(a.file, b.file) || a.line - b.line);
  const { shown, note } = capped(ranked);
  return [
    "## Functions\n",
    "Hot functions rank by cyclomatic complexity, and equal values rank by file, then line. " +
      "Values are estimated by reading. Each file lists at most 6 hot functions, " +
      "so a function that ranks fourth or lower in its own file can be missing.\n",
    table(
      ["Rank", "Function", "File", "Line", "Cyclomatic", "Nesting", "Length", "Params"],
      shown.map((hot, i) => [
        i + 1,
        `\`${hot.name}\``,
        `\`${hot.file}\``,
        hot.line,
        hot.cyclomatic,
        hot.nesting,
        lengthOf(hot),
        hot.params,
      ]),
    ),
    note,
  ];
}

function renderLanes(report) {
  const out = [
    "## Lanes\n",
    "Every value is estimated by reading. Maxima come from the hot functions, and length and params skip `<module>`.\n",
  ];
  for (const lane of list(report.lanes)) {
    out.push(`### ${lane.name}\n`);
    out.push(`Owner: ${list(lane.owner).join(", ") || "unstated"}.\n`);
    out.push(
      table(
        ["File", "Fan-out", "Mutable state", "Functions", "Max cyclomatic", "Max nesting", "Max length", "Max params"],
        list(lane.entries).map((entry) => {
          const max = fileMaxima(entry);
          return [
            `\`${entry.file}\``,
            entry.fanOut,
            entry.mutableState.count,
            entry.functions,
            max.cyclomatic,
            max.nesting,
            max.length,
            max.params,
          ];
        }),
      ),
    );
    for (const note of list(lane.notes)) out.push(`- ${cell(note)}\n`);
  }
  return out;
}

function renderGaps(report) {
  const skipped = list(report.lanes).flatMap((lane) =>
    list(lane.skipped).map((record) => [`\`${record.file}\``, `skipped by the ${lane.name} analyst: ${record.reason}`]),
  );
  const gaps = list(report.gaps).map((gap) => [`\`${gap.file}\``, gap.reason]);
  return ["## Gaps\n", table(["File", "Reason"], [...gaps, ...skipped])];
}

function renderNotMeasured(files) {
  const rows = Object.keys(files)
    .filter((path) => files[path].status !== "text")
    .sort(byPath)
    .map((path) => [`\`${path}\``, files[path].status]);
  return ["## Not measured\n", table(["Path", "Status"], rows)];
}

export function renderReport(report, history) {
  const files = history.files;
  return [
    `# Complexity audit: ${report.scope.root}\n`,
    ...renderSummary(report, history),
    ...renderHotspots(report, files),
    ...renderFunctions(report),
    ...renderLanes(report),
    ...renderGaps(report),
    ...renderNotMeasured(files),
  ]
    .filter((part) => part !== "")
    .join("\n");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function main(args) {
  const [input, output] = args;
  if (!input) {
    process.stderr.write("render-report.mjs: usage: render-report.mjs <report.json> [<report.md>]\n");
    return 2;
  }
  const historyPath = join(dirname(input), "history.json");
  let report;
  let history;
  try {
    report = readJson(input);
    history = readJson(historyPath);
  } catch (error) {
    process.stderr.write(`render-report.mjs: cannot read ${input} and ${historyPath}: ${error.message}\n`);
    return 1;
  }
  const errors = validateReport(report, history);
  if (errors.length > 0) {
    process.stderr.write(`render-report.mjs: ${errors.length} error(s). Nothing written\n`);
    for (const error of errors) process.stderr.write(`- ${error}\n`);
    return 1;
  }
  const target = output ?? join(dirname(input), "report.md");
  writeFileSync(target, renderReport(report, history));
  process.stdout.write(`${target}\n`);
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
