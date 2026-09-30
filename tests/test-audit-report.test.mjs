import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { renderReport, validateReport } from "../skills/test-audit/scripts/render-report.mjs";

const RENDER = resolve("skills/test-audit/scripts/render-report.mjs");

const EVIDENCE = {
  location: "tests/cache.test.js:40 clears on write",
  origin: "a1b2c3d added it with the first cache",
  caughtBug: "none; the mock clears the cache itself",
  callers: "src/store.js:12",
  remainingProof: "tests/store.test.js:88 write invalidates cached read",
  freedCode: "src/cache.js:9 resetForTests export",
  riskAndCommand: "low; node --test tests/store.test.js",
};

function report(overrides = {}) {
  return {
    version: 1,
    scope: { root: "demo", paths: [], discovery: "git ls-files '*.test.js'", commit: "abc1234", date: "2026-09-30" },
    baseline: { command: "node --test", status: "ran", failures: [] },
    inventory: ["tests/cache.test.js", "tests/store.test.js"],
    lanes: [
      {
        name: "cache",
        owner: ["src/cache.js"],
        files: ["tests/cache.test.js", "tests/store.test.js"],
        tests: [
          { id: "tests/store.test.js::write invalidates cached read", name: "write invalidates cached read", file: "tests/store.test.js", line: 88, mark: "R", contract: "a write evicts the cached value", catches: "stale reads after a write" },
          { id: "tests/cache.test.js::clears on write", name: "clears on write", file: "tests/cache.test.js", line: 40, mark: "D", junkClass: "promises-more-than-checked", evidence: { ...EVIDENCE }, verified: true },
        ],
        seams: [{ location: "src/cache.js:9", kind: "export", freedBy: ["tests/cache.test.js::clears on write"] }],
      },
    ],
    layers: [],
    downgraded: [],
    gaps: [],
    ...overrides,
  };
}

test("a complete report has no validation errors", () => {
  assert.deepEqual(validateReport(report()), []);
});

test("a delete candidate missing one evidence field is rejected with that field named", () => {
  const broken = report();
  delete broken.lanes[0].tests[1].evidence.remainingProof;
  assert.deepEqual(validateReport(broken), [
    "tests/cache.test.js::clears on write: mark D requires evidence.remainingProof; complete it or mark the test R",
  ]);
});

test("a delete candidate that fails on the baseline is rejected as a product-bug lead", () => {
  const broken = report({
    baseline: { command: "node --test", status: "ran", failures: [{ file: "tests/cache.test.js", name: "clears on write", assertion: "expected 0, got 1" }] },
  });
  assert.deepEqual(validateReport(broken), [
    "tests/cache.test.js::clears on write: fails on the baseline, so it is a product-bug lead and cannot be marked D",
  ]);
});

test("an unverified delete candidate is rejected", () => {
  const broken = report();
  delete broken.lanes[0].tests[1].verified;
  assert.deepEqual(validateReport(broken), ["tests/cache.test.js::clears on write: mark D requires verified: true"]);
});

test("an inventory file placed in no lane and no gap is rejected", () => {
  const broken = report({ inventory: ["tests/cache.test.js", "tests/store.test.js", "tests/orphan.test.js"] });
  assert.deepEqual(validateReport(broken), ["tests/orphan.test.js is in no lane and no gap"]);
});

test("the rendered summary counts each mark", () => {
  const markdown = renderReport(report());
  assert.match(markdown, /\| R: retain \| 1 \|/);
  assert.match(markdown, /\| D: delete \| 1 \|/);
});

test("the rendered delete table carries the remaining proof", () => {
  const markdown = renderReport(report());
  assert.match(markdown, /\| cache \| tests\/cache\.test\.js:40 clears on write \| promises-more-than-checked \|.*tests\/store\.test\.js:88 write invalidates cached read/);
});

test("the CLI rejects an invalid report and writes no markdown", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "test-audit-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const broken = report({ version: 2 });
  writeFileSync(join(dir, "report.json"), JSON.stringify(broken));
  const run = spawnSync(process.execPath, [RENDER, join(dir, "report.json")], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /- version must be 1/);
  assert.equal(existsSync(join(dir, "report.md")), false);
});
