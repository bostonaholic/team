import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";

const ROOT = process.cwd();
const SKILL = join(ROOT, "skills", "team-pr", "SKILL.md");
const REFERENCE = join(ROOT, "skills", "team-pr", "references", "screenshots.md");

describe("team-pr screenshot contract", () => {
  test("loads screenshot procedure only for manifest or UI changes", () => {
    const body = read(SKILL);
    expect(body).toContain("When a manifest exists, or a later");
    expect(body).toContain("references/screenshots.md");
    expect(body).toContain("verifying-ux");
    expect(existsSync(REFERENCE)).toBe(true);
  });

  test("keeps PR-first upload, bounded polling, and non-blocking failure", () => {
    const reference = read(REFERENCE);
    const open = reference.indexOf("after opening the draft PR");
    const upload = reference.indexOf("Upload only existing PNG");
    expect(open).toBeGreaterThanOrEqual(0);
    expect(upload).toBeGreaterThan(open);
    expect(reference).toContain("at most 60 seconds");
    expect(reference).toContain("Never submit a comment");
    expect(reference).toContain("Screenshots never block");
  });

  test("refreshes UI changes and preserves existing uploads otherwise", () => {
    const reference = read(REFERENCE);
    expect(reference).toContain("If UI changed on a later push");
    expect(reference).toContain("without re-uploading");
  });
});
