import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  discoverArtifactDirectory,
  resolveArtifactDirectory,
} from "../skills/artifact-frontmatter/scripts/resolve-topic.mjs";

const roots: string[] = [];
const script = join(process.cwd(), "skills", "artifact-frontmatter", "scripts", "resolve-topic.mjs");

function fixture(): { root: string; older: string; newer: string } {
  const root = mkdtempSync(join(tmpdir(), "artifact-discovery-"));
  roots.push(root);
  const older = join(root, "docs", "plans", "2026-01-01-older");
  const newer = join(root, "docs", "plans", "2026-01-02-newer");
  mkdirSync(older, { recursive: true });
  mkdirSync(newer, { recursive: true });
  writeFileSync(join(older, "6-design.md"), "older");
  writeFileSync(join(newer, "6-design.md"), "newer");
  utimesSync(join(older, "6-design.md"), new Date(1_000), new Date(1_000));
  utimesSync(join(newer, "6-design.md"), new Date(2_000), new Date(2_000));
  return { root, older, newer };
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("artifact resolver modes", () => {
  test("keeps exact-ID resolution separate", () => {
    const { root, older } = fixture();
    expect(resolveArtifactDirectory(root, "2026-01-01-older")).toBe(older);
    expect(resolveArtifactDirectory(root, "newest")).toBeNull();
  });

  test("an existing explicit directory wins without discovery filters", () => {
    const { root, older } = fixture();
    expect(discoverArtifactDirectory(root, older, "6-design.md")).toMatchObject({
      status: "resolved",
      source: "explicit",
      dir: older,
    });
    rmSync(join(older, "6-design.md"));
    expect(discoverArtifactDirectory(root, older, "6-design.md")).toMatchObject({
      status: "resolved",
      source: "explicit",
      dir: older,
    });
  });

  test("empty or invalid explicit input selects the newest matching topic", () => {
    const { root, older, newer } = fixture();
    expect(discoverArtifactDirectory(root, "", "6-design.md")).toMatchObject({
      status: "resolved",
      source: "newest",
      dir: newer,
    });
    expect(discoverArtifactDirectory(root, "missing", "6-design.md")).toMatchObject({
      status: "resolved",
      source: "newest",
      dir: newer,
    });
  });

  test("newest means the latest phase artifact, not only the predecessor", () => {
    const { root, older, newer } = fixture();
    writeFileSync(join(older, "8-plan.md"), "new activity");
    utimesSync(join(older, "8-plan.md"), new Date(3_000), new Date(3_000));
    expect(discoverArtifactDirectory(root, "", "6-design.md")).toMatchObject({
      status: "resolved",
      source: "newest",
      dir: older,
    });
  });

  test("returns needs input when no topic qualifies", () => {
    const { root, older, newer } = fixture();
    rmSync(join(older, "6-design.md"));
    rmSync(join(newer, "6-design.md"));
    expect(discoverArtifactDirectory(root, "", "6-design.md")).toEqual({
      status: "needs-input",
      reason: "no-candidate",
    });
  });

  test("discover CLI reads raw paths from stdin", () => {
    const { root, older } = fixture();
    const result = spawnSync(process.execPath, [script, "discover", root, "6-design.md"], {
      input: older,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "resolved", dir: older });
  });
});
