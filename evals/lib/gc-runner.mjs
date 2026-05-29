// evals/lib/gc-runner.mjs
//
// Standalone CLI entry for `evals/e2e/gc.sh`. Reads its inputs from the
// environment (no string-interpolated arguments) so a value containing
// single quotes or shell metacharacters cannot inject JS — every input
// crosses the process boundary as opaque env-var bytes.
//
// Environment:
//   EVALS_RESULTS_ROOT  results root (required; gc.sh always sets it)
//   EVALS_GC_KEEP       integer >= 0 (default 10). Rejected on non-integer.

import { gc } from "./result-store.mjs";

function main() {
  const resultsRoot = process.env.EVALS_RESULTS_ROOT;
  if (!resultsRoot) {
    process.stderr.write(
      "gc-runner: EVALS_RESULTS_ROOT is required\n",
    );
    return 1;
  }

  const rawKeep = process.env.EVALS_GC_KEEP;
  let keep = 10;
  if (rawKeep !== undefined && rawKeep !== "") {
    if (!/^[0-9]+$/.test(rawKeep)) {
      process.stderr.write(
        `gc-runner: EVALS_GC_KEEP must be a non-negative integer (got: '${rawKeep}')\n`,
      );
      return 1;
    }
    keep = parseInt(rawKeep, 10);
  }

  const removed = gc({ resultsRoot, keep });
  for (const path of removed) {
    process.stdout.write(`removed: ${path}\n`);
  }
  return 0;
}

try {
  const code = main();
  process.exit(code);
} catch (err) {
  process.stderr.write(`${(err && err.stack) || err}\n`);
  process.exit(1);
}
