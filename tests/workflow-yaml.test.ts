// tests/workflow-yaml.test.ts
//
// L2 tripwire (free, deterministic): every file under .github/workflows/
// must parse as YAML. The other workflow tripwires read these files as raw
// text and regex-match contract phrases, so a syntax error would otherwise
// pass the free gate and surface only when the workflow next triggers — for
// schedule-only workflows that is the next cron, and an unparseable
// workflow's own failure-reporting job can never fire (#271).
//
// Parse-only on purpose: Actions schema/semantic validation is a heavier
// tool than the silent-window failure requires.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOWS_DIR = join(process.cwd(), ".github", "workflows");

const workflowFiles = readdirSync(WORKFLOWS_DIR)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .sort();

describe("workflow yaml: every .github/workflows file parses", () => {
  test("the workflows directory is not empty", () => {
    // Guard: an empty haystack must fail, not vacuously pass the per-file
    // checks below (a moved directory would otherwise go permanently green).
    expect(workflowFiles.length).toBeGreaterThan(0);
  });

  for (const name of workflowFiles) {
    test(`${name} parses as YAML`, () => {
      const text = readFileSync(join(WORKFLOWS_DIR, name), "utf8");
      expect(() => Bun.YAML.parse(text)).not.toThrow();
    });
  }
});
