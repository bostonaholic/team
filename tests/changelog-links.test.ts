// tests/changelog-links.test.ts
//
// L2 tripwire (free, deterministic): links in the changelog's `[Unreleased]`
// section must be ABSOLUTE URLs. A release cuts that section verbatim into the
// GitHub release notes, and the release page is not served from the repo root,
// so repository-relative links (e.g. `](docs/versioning.md)`) render as dead
// links there. Enforcing it on `[Unreleased]` catches bad links while entries
// accumulate — before they are ever cut into a published release.
//
// Convention: skills/changelog/SKILL.md ("Use absolute URLs for links").
// Historical released sections are not rewritten; the rule applies going forward.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { read } from "./helpers/text";

const REPO_ROOT = join(import.meta.dir, "..");
const CHANGELOG = join(REPO_ROOT, "CHANGELOG.md");

// Body of a top-level `## [..]` section, up to the next `## [` (or EOF).
function section(md: string, header: string): string {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.trimEnd() === header);
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## \[/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

// Markdown link/image targets — the X in `](X)`.
function linkTargets(md: string): string[] {
  const targets: string[] = [];
  const re = /\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) targets.push(m[1]!.trim());
  return targets;
}

// Absolute = a real scheme (http/https/mailto) or a same-page anchor.
const ABSOLUTE = /^(https?:\/\/|mailto:|#)/;

describe("changelog: [Unreleased] links are absolute (release-notes-safe)", () => {
  const changelog = read(CHANGELOG);
  const unreleased = section(changelog, "## [Unreleased]");

  test("no repository-relative links in the [Unreleased] section", () => {
    const relative = linkTargets(unreleased).filter((t) => !ABSOLUTE.test(t));
    // Surfaces the offending targets in the failure message.
    expect(relative).toEqual([]);
  });

  // Guards the guard: prove the matcher actually rejects a relative target,
  // so a future refactor can't silently turn this tripwire into a no-op.
  test("the absolute-URL matcher rejects a relative path", () => {
    expect(ABSOLUTE.test("docs/versioning.md")).toBe(false);
    expect(ABSOLUTE.test("./guide.md")).toBe(false);
    expect(ABSOLUTE.test("../x.md")).toBe(false);
    expect(ABSOLUTE.test("https://github.com/o/r/blob/main/docs/x.md")).toBe(true);
    expect(ABSOLUTE.test("#section")).toBe(true);
  });
});
