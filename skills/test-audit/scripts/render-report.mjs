#!/usr/bin/env node
// Validates a test-audit report.json and renders report.md beside it.
// Usage: render-report.mjs <report.json> [<report.md>]
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const MARKS = ["R", "F", "C", "D"];
export const JUNK_CLASSES = [
  "cannot-fail",
  "restates-source",
  "duplicates-stronger-proof",
  "keeps-test-only-code",
  "promises-more-than-checked",
];
export const EVIDENCE_FIELDS = [
  "location",
  "origin",
  "caughtBug",
  "callers",
  "remainingProof",
  "freedCode",
  "riskAndCommand",
];

const REQUIRED_BY_MARK = {
  R: ["contract", "catches"],
  F: ["contract", "junkClass", "action"],
  C: ["junkClass", "absorbedBy"],
  D: ["junkClass"],
};

const filled = (value) => typeof value === "string" && value.trim() !== "";
const list = (value) => (Array.isArray(value) ? value : []);

export function validateReport(report) {
  const errors = [];
  if (report === null || typeof report !== "object") return ["report is not a JSON object"];
  if (report.version !== 1) errors.push("version must be 1");

  const scope = report.scope ?? {};
  for (const field of ["commit", "discovery", "date"]) {
    if (!filled(scope[field])) errors.push(`scope.${field} is required`);
  }

  const baseline = report.baseline ?? {};
  if (baseline.status === "ran") {
    if (!filled(baseline.command)) errors.push("baseline.command is required when baseline.status is ran");
  } else if (baseline.status === "not-run") {
    if (!filled(baseline.reason)) errors.push("baseline.reason is required when baseline.status is not-run");
  } else {
    errors.push("baseline.status must be ran or not-run");
  }
  const redTests = new Set(list(baseline.failures).map((f) => `${f.file}::${f.name}`));

  const inventory = list(report.inventory);
  const placements = new Map(inventory.map((file) => [file, 0]));
  const place = (file, where) => {
    if (!placements.has(file)) errors.push(`${where} lists ${file}, which is not in inventory`);
    else placements.set(file, placements.get(file) + 1);
  };

  const tests = new Map();
  for (const lane of list(report.lanes)) {
    const laneName = filled(lane.name) ? lane.name : "(unnamed lane)";
    if (!filled(lane.name)) errors.push("every lane needs a name");
    const laneFiles = new Set(list(lane.files));
    for (const file of laneFiles) place(file, `lane ${laneName}`);

    for (const test of list(lane.tests)) {
      const id = test.id;
      if (!filled(id)) {
        errors.push(`lane ${laneName} has a test with no id`);
        continue;
      }
      if (tests.has(id)) errors.push(`test id ${id} appears more than once`);
      tests.set(id, test);
      if (!laneFiles.has(test.file)) errors.push(`${id}: file ${test.file} is not in lane ${laneName}`);
      if (!MARKS.includes(test.mark)) {
        errors.push(`${id}: mark must be one of ${MARKS.join(", ")}`);
        continue;
      }
      for (const field of REQUIRED_BY_MARK[test.mark]) {
        if (!filled(test[field])) errors.push(`${id}: mark ${test.mark} requires ${field}`);
      }
      if (test.mark !== "R" && filled(test.junkClass) && !JUNK_CLASSES.includes(test.junkClass)) {
        errors.push(`${id}: junkClass ${test.junkClass} is not one of ${JUNK_CLASSES.join(", ")}`);
      }
      if (test.mark === "D") {
        for (const field of EVIDENCE_FIELDS) {
          if (!filled(test.evidence?.[field])) {
            errors.push(`${id}: mark D requires evidence.${field}; complete it or mark the test R`);
          }
        }
        if (redTests.has(`${test.file}::${test.name}`)) {
          errors.push(`${id}: fails on the baseline, so it is a product-bug lead and cannot be marked D`);
        }
      }
      if ((test.mark === "C" || test.mark === "D") && test.verified !== true) {
        errors.push(`${id}: mark ${test.mark} requires verified: true`);
      }
    }
  }

  for (const gap of list(report.gaps)) place(gap.file, "gaps");
  for (const [file, count] of placements) {
    if (count === 0) errors.push(`${file} is in no lane and no gap`);
    if (count > 1) errors.push(`${file} is placed ${count} times; place it exactly once`);
  }

  for (const lane of list(report.lanes)) {
    for (const seam of list(lane.seams)) {
      for (const id of list(seam.freedBy)) {
        if (!tests.has(id)) errors.push(`seam ${seam.location} names unknown test ${id}`);
      }
    }
  }
  for (const entry of list(report.downgraded)) {
    const test = tests.get(entry.id);
    if (!test) errors.push(`downgraded names unknown test ${entry.id}`);
    else if (test.mark !== "R") errors.push(`${entry.id} is listed as downgraded but is marked ${test.mark}`);
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

function allTests(report) {
  return list(report.lanes).flatMap((lane) => list(lane.tests).map((test) => ({ lane: lane.name, ...test })));
}

export function renderReport(report) {
  const tests = allTests(report);
  const count = (mark) => tests.filter((t) => t.mark === mark).length;
  const byMark = (mark) => tests.filter((t) => t.mark === mark);
  const baseline = report.baseline;
  const scope = report.scope;
  const out = [];

  out.push(`# Test audit: ${scope.root ?? "repository"}\n`);
  out.push(
    `Commit \`${scope.commit}\` on ${scope.date}. Scope: ${list(scope.paths).join(", ") || "whole repository"}. ` +
      `Inventory: \`${scope.discovery}\`.\n`,
  );
  if (list(scope.dirty).length > 0) out.push(`Audited with uncommitted changes in: ${scope.dirty.join(", ")}.\n`);

  out.push("## Summary\n");
  out.push(
    table(
      ["Measure", "Count"],
      [
        ["Test files", list(report.inventory).length],
        ["Tests audited", tests.length],
        ["R: retain", count("R")],
        ["F: fix the assertion", count("F")],
        ["C: consolidate", count("C")],
        ["D: delete", count("D")],
        ["Baseline failures", list(baseline.failures).length],
        ["Downgraded to R", list(report.downgraded).length],
        ["Files not audited", list(report.gaps).length],
      ],
    ),
  );

  out.push("## Baseline\n");
  out.push(
    baseline.status === "ran"
      ? `Ran \`${baseline.command}\`: ${list(baseline.failures).length} failing test(s).\n`
      : `Not run: ${baseline.reason}. Every mark rests on reading alone.\n`,
  );

  out.push("## Product-bug leads\n");
  out.push("A test that fails on the baseline points at the product first. Reproduce it and repair the owner.\n");
  out.push(table(["File", "Test", "Failure"], list(baseline.failures).map((f) => [f.file, f.name, f.assertion])));

  out.push("## Delete (D)\n");
  out.push(
    table(
      ["Lane", "Test", "Class", ...EVIDENCE_FIELDS],
      byMark("D").map((t) => [t.lane, `${t.file}:${t.line ?? "?"} ${t.name}`, t.junkClass, ...EVIDENCE_FIELDS.map((f) => t.evidence[f])]),
    ),
  );
  out.push("## Consolidate (C)\n");
  out.push(
    table(
      ["Lane", "Test", "Class", "Absorbed by"],
      byMark("C").map((t) => [t.lane, `${t.file}:${t.line ?? "?"} ${t.name}`, t.junkClass, t.absorbedBy]),
    ),
  );
  out.push("## Fix the assertion (F)\n");
  out.push(
    table(
      ["Lane", "Test", "Class", "Contract", "Repair"],
      byMark("F").map((t) => [t.lane, `${t.file}:${t.line ?? "?"} ${t.name}`, t.junkClass, t.contract, t.action]),
    ),
  );

  out.push("## Redundant layers\n");
  out.push(
    table(
      ["Contract", "Keeper", "Retire", "Carry into keeper"],
      list(report.layers).map((l) => [l.contract, l.keeper, list(l.retire).join(", "), list(l.carry).join("; ")]),
    ),
  );

  out.push("## Test-only production code\n");
  out.push(
    table(
      ["Location", "Kind", "Freed by"],
      list(report.lanes).flatMap((lane) => list(lane.seams).map((s) => [s.location, s.kind, list(s.freedBy).join(", ")])),
    ),
  );

  out.push("## Downgraded candidates\n");
  out.push(table(["Test", "Was", "Reason"], list(report.downgraded).map((d) => [d.id, d.from, d.reason])));

  out.push("## Suggested batches\n");
  const batches = list(report.lanes).filter((lane) => list(lane.tests).some((t) => t.mark === "C" || t.mark === "D"));
  out.push(
    batches.length === 0
      ? "None.\n"
      : `${batches
          .map((lane) => {
            const ids = list(lane.tests).filter((t) => t.mark === "C" || t.mark === "D");
            return `- **${lane.name}**: ${ids.length} candidate(s) in one owner-boundary change.`;
          })
          .join("\n")}\n`,
  );

  out.push("## Auditor notes\n");
  const notes = list(report.lanes).flatMap((lane) => list(lane.notes).map((note) => `- **${lane.name}**: ${cell(note)}`));
  out.push(notes.length === 0 ? "None.\n" : `${notes.join("\n")}\n`);

  out.push("## Ledger\n");
  for (const lane of list(report.lanes)) {
    out.push(`### ${lane.name}\n`);
    out.push(`Owner: ${list(lane.owner).join(", ") || "unstated"}.\n`);
    out.push(
      table(
        ["Mark", "Test", "Guards", "Catches"],
        list(lane.tests).map((t) => [t.mark, `${t.file}:${t.line ?? "?"} ${t.name}`, t.contract ?? t.absorbedBy ?? "", t.catches ?? t.junkClass ?? ""]),
      ),
    );
  }

  out.push("## Not audited\n");
  out.push(table(["File", "Reason"], list(report.gaps).map((g) => [g.file, g.reason])));

  return out.join("\n");
}

function main(args) {
  const [input, output] = args;
  if (!input) {
    process.stderr.write("render-report.mjs: usage: render-report.mjs <report.json> [<report.md>]\n");
    return 2;
  }
  let report;
  try {
    report = JSON.parse(readFileSync(input, "utf8"));
  } catch (error) {
    process.stderr.write(`render-report.mjs: cannot read ${input}: ${error.message}\n`);
    return 1;
  }
  const errors = validateReport(report);
  if (errors.length > 0) {
    process.stderr.write(`render-report.mjs: ${errors.length} error(s); nothing written\n`);
    for (const error of errors) process.stderr.write(`- ${error}\n`);
    return 1;
  }
  const target = output ?? join(dirname(input), "report.md");
  writeFileSync(target, renderReport(report));
  process.stdout.write(`${target}\n`);
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
