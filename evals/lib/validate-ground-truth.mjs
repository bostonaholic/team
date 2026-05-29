// evals/lib/validate-ground-truth.mjs
//
// Standalone validator invoked from `evals/gate/run.sh`. The path is
// read from argv (not interpolated into JS source) so a path containing
// quotes or shell metachars cannot inject code.
//
// Usage: node evals/lib/validate-ground-truth.mjs <ground-truth.json>
//
// Exit codes:
//   0  schema-valid
//   1  missing `bugs[]`
//   2  missing or non-numeric `minimum_detection`
//   3  parse / IO error or wrong arguments

import { readFileSync } from "node:fs";

function main() {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write(
      "validate-ground-truth: <path> argument required\n",
    );
    return 3;
  }
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    process.stderr.write(`parse error: ${err.message}\n`);
    return 3;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    process.stderr.write(`parse error: ${err.message}\n`);
    return 3;
  }
  if (!Array.isArray(data.bugs) || data.bugs.length === 0) {
    process.stdout.write("missing bugs\n");
    return 1;
  }
  if (typeof data.minimum_detection !== "number") {
    process.stdout.write("missing minimum_detection\n");
    return 2;
  }
  return 0;
}

process.exit(main());
