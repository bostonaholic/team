#!/usr/bin/env bun
// scripts/eval-select.ts
//
// Prints which E2E tests would run for the current diff. Honors EVALS_ALL=1
// and EVALS_TIER=gate|periodic.

import {
  E2E_TIERS,
  E2E_TOUCHFILES,
  GLOBAL_TOUCHFILES,
  detectBaseBranch,
  filterByTier,
  getChangedFiles,
  selectTests,
} from "../tests/helpers/touchfiles";

const base = detectBaseBranch();
const changed = getChangedFiles(base);
const sel = selectTests(changed, E2E_TOUCHFILES, GLOBAL_TOUCHFILES);
const filtered = filterByTier(
  sel.selected,
  E2E_TIERS as Record<string, "gate" | "periodic">,
);

process.stderr.write(`base: ${base ?? "(none)"}\n`);
process.stderr.write(`changed: ${changed === null ? "(git failed)" : `${changed.length} file(s)`}\n`);
process.stderr.write(`reason: ${sel.reason}\n`);
if (process.env.EVALS_TIER) {
  process.stderr.write(`tier filter: ${process.env.EVALS_TIER}\n`);
}
process.stderr.write(`selected: ${filtered.size} test(s)\n`);
for (const name of [...filtered].sort()) {
  process.stdout.write(`${name}\n`);
}
