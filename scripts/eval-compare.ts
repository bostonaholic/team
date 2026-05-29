#!/usr/bin/env bun
// scripts/eval-compare.ts
//
// CLI: `bun run eval:compare <prev.json> <curr.json>`
// Prints a comparison summary: regressions first, then improvements, then
// budget regressions (efficiency drops without verdict change).

import { readFileSync } from "node:fs";
import {
  compareEvalResults,
  findBudgetRegressions,
  generateCommentary,
  type EvalResult,
} from "../test/helpers/eval-store";

function usage(): never {
  process.stderr.write("usage: bun run eval:compare <prev.json> <curr.json>\n");
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.length !== 2) usage();
const [prevPath, currPath] = args as [string, string];

const prev = JSON.parse(readFileSync(prevPath, "utf8")) as EvalResult;
const curr = JSON.parse(readFileSync(currPath, "utf8")) as EvalResult;

const cmp = compareEvalResults(prev, curr);
process.stdout.write(generateCommentary(cmp) + "\n");

const budget = findBudgetRegressions(cmp);
if (budget.length > 0) {
  process.stdout.write("\nBUDGET REGRESSIONS (>=2x growth):\n");
  for (const r of budget) {
    process.stdout.write(`  - ${r.name}: ${r.reason}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `\ntotals: cost ${prev.total_cost_usd.toFixed(4)} -> ${curr.total_cost_usd.toFixed(4)} | ` +
    `duration ${prev.total_duration_ms}ms -> ${curr.total_duration_ms}ms\n`,
);
process.exit(cmp.regressed > 0 ? 1 : 0);
