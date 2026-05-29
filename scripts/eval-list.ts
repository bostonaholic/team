#!/usr/bin/env bun
// scripts/eval-list.ts
//
// Lists every known test (E2E + LLM-judge) with its tier and touchfile globs.

import {
  E2E_TIERS,
  E2E_TOUCHFILES,
  LLM_JUDGE_TOUCHFILES,
} from "../tests/helpers/touchfiles";

function dump(label: string, map: Record<string, string[]>, tiers?: Record<string, string>): void {
  process.stdout.write(`${label}:\n`);
  const names = Object.keys(map).sort();
  if (names.length === 0) {
    process.stdout.write("  (none)\n");
    return;
  }
  for (const name of names) {
    const t = tiers?.[name] ?? "?";
    const globs = (map[name] ?? []).join(", ");
    process.stdout.write(`  ${name} [tier=${t}]: ${globs}\n`);
  }
}

dump("E2E tests", E2E_TOUCHFILES, E2E_TIERS);
dump("LLM-judge tests", LLM_JUDGE_TOUCHFILES);
