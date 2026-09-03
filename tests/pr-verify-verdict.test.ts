import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { finalVerdict } from "../skills/pr-verify/scripts/final-verdict.mjs";

const SCRIPT = join(
  import.meta.dir,
  "..",
  "skills",
  "pr-verify",
  "scripts",
  "final-verdict.mjs",
);

describe("pr-verify final verdict", () => {
  test("is ready only when every item passes without low confidence", () => {
    expect(
      finalVerdict([
        { verdict: "PASS", confidence: "HIGH" },
        { verdict: "PASS", confidence: "MEDIUM" },
      ]),
    ).toBe("READY");
  });

  test("needs attention for partial or low-confidence evidence", () => {
    expect(finalVerdict([{ verdict: "PARTIAL", confidence: "HIGH" }])).toBe(
      "NEEDS ATTENTION",
    );
    expect(finalVerdict([{ verdict: "PASS", confidence: "LOW" }])).toBe(
      "NEEDS ATTENTION",
    );
  });

  test("a failure always wins", () => {
    expect(
      finalVerdict([
        { verdict: "PARTIAL", confidence: "LOW" },
        { verdict: "FAIL", confidence: "HIGH" },
      ]),
    ).toBe("NOT READY");
  });

  test("rejects empty and unknown input", () => {
    expect(() => finalVerdict([])).toThrow("non-empty");
    expect(() =>
      finalVerdict([{ verdict: "PASS", confidence: "UNKNOWN" }] as never),
    ).toThrow(
      "confidence",
    );
  });

  test("CLI accepts JSON only through stdin", () => {
    const result = spawnSync("node", [SCRIPT], {
      input: JSON.stringify([{ verdict: "FAIL", confidence: "HIGH" }]),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ verdict: "NOT READY" });
  });
});
