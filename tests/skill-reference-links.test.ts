// tests/skill-reference-links.test.ts
//
// L2 tripwire: no skill links at a reference file that is not there.
//
// Skills carry their shared rules as markdown links — `Read and apply:
// [durable state rules](../team/principles/durable-state.md)` — and every skill
// states what a miss costs: "If a required read fails, stop that step and
// report its resolved path." A link whose target does not exist therefore does
// not degrade, it halts the step that read it, and nothing on the way in says
// so. Renaming or moving a reference file is the ordinary way to create one.
//
// WHICH BASE A LINK RESOLVES AGAINST. Two are in use, and this checks against
// both, because both are load-bearing on disk:
//
//   - The skill root, for a link that reaches outside its own directory:
//     `../team/principles/durable-state.md` inside
//     skills/pr-rebase/references/ means skills/team/principles/.
//   - The containing directory, for a sibling: `15-host-dispatch.md` inside
//     skills/team/references/ means the file beside it. That form is not
//     incidental — tests/host-neutral-dispatch.test.ts resolves exactly this
//     link file-relative and asserts the target, so the two bases coexist by
//     contract rather than by accident.
//
// Requiring one base would be the stricter rule and it is the wrong one: it
// reports one of those two working forms as broken. So the invariant here is
// existence, not style — a link must land on a real file under some base a
// reader would actually try.
//
// WHAT IS NOT A LINK. Three exclusions, each for a case on disk:
//   - External targets (`https:`, `mailto:`) and bare anchors (`#section`).
//   - Anything inside a code span or fence. skills/team-pr/references/
//     changelog.md names `[versioning](docs/versioning.md)` inside backticks
//     precisely to say not to write that form; reading it as a real link
//     reports a rule's documentation as a violation of it.
//   - Prose placeholders — `<resolved-url>`, `NNNN-title.md` — which are
//     shapes to fill in, not paths.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = join(import.meta.dir, "..");
const SKILLS_ROOT = join(REPO_ROOT, "skills");

const MARKDOWN_LINK = /\[[^\]]*\]\(([^)]+)\)/g;

/**
 * `text` with every fenced block and inline code span overwritten by spaces.
 * Length and line structure are preserved so offsets still line up; only the
 * content stops matching. Fences are blanked before spans, so a stray backtick
 * inside a fence cannot open a span across it.
 */
function withoutCode(text: string): string {
  const blank = (match: string) => match.replace(/[^\n]/g, " ");
  return text.replace(/^```[\s\S]*?^```/gm, blank).replace(/`[^`\n]*`/g, blank);
}

/** True when `target` is a link this rule governs: intra-repo, and a real path. */
function isGovernedTarget(target: string): boolean {
  if (/^(https?:|mailto:|#)/.test(target)) return false;
  if (/[<>…]/.test(target) || target.includes("NNNN")) return false;
  return (target.split("#")[0] ?? "") !== "";
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

/** Every skill directory that holds a `SKILL.md`. */
function skillRoots(): string[] {
  return readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(SKILLS_ROOT, entry.name, "SKILL.md")))
    .map((entry) => join(SKILLS_ROOT, entry.name))
    .sort();
}

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return markdownFiles(path);
      return entry.name.endsWith(".md") ? [path] : [];
    })
    .sort();
}

/**
 * Dangling links under `skillRoot`, each naming the file and the raw target.
 * Pure over (root, files) so the planted-positive test drives the same code the
 * sweep drives.
 */
function danglingLinks(skillRoot: string, files: { path: string; text: string }[]): string[] {
  const offenders: string[] = [];
  for (const { path, text } of files) {
    for (const match of withoutCode(text).matchAll(MARKDOWN_LINK)) {
      const target = (match[1] as string).trim();
      if (!isGovernedTarget(target)) continue;
      const relativePath = target.split("#")[0] as string;
      if (isFile(resolve(skillRoot, relativePath))) continue;
      if (isFile(resolve(dirname(path), relativePath))) continue;
      offenders.push(`${relative(REPO_ROOT, path)} -> ${target}`);
    }
  }
  return offenders;
}

describe("Skill reference links land on real files", () => {
  const roots = skillRoots();
  const filesByRoot = new Map(
    roots.map((root) => [root, markdownFiles(root).map((path) => ({ path, text: read(path) }))]),
  );

  test("the sweep sees the skills, not an empty haystack", () => {
    // Blindness guard: a mis-scoped read makes the check below vacuously green
    // and nothing announces it (docs/testing.md, "Prove a negative check can
    // find a positive"). Floors, not exact counts — adding a skill is ordinary
    // work and must not fail this.
    expect(roots.length).toBeGreaterThan(20);
    const governed = [...filesByRoot.values()]
      .flat()
      .flatMap(({ text }) => [...withoutCode(text).matchAll(MARKDOWN_LINK)])
      .filter((match) => isGovernedTarget((match[1] as string).trim()));
    expect(governed.length).toBeGreaterThan(300);
  });

  test("no link points at a file that does not exist", () => {
    const offenders = roots.flatMap((root) => danglingLinks(root, filesByRoot.get(root) ?? []));
    expect(offenders).toEqual([]);
  });

  test("the check detects planted violations", () => {
    const root = join(SKILLS_ROOT, "team");
    const skillFile = join(root, "SKILL.md");
    const referenceFile = join(root, "references", "a.md");

    // Both working bases pass.
    expect(danglingLinks(root, [{ path: skillFile, text: "[rules](references/execution.md)" }])).toEqual([]);
    expect(danglingLinks(root, [{ path: referenceFile, text: "[rules](execution.md)" }])).toEqual([]);

    // A target that exists under neither base is reported.
    expect(danglingLinks(root, [{ path: skillFile, text: "[rules](references/nope.md)" }])).toEqual([
      "skills/team/SKILL.md -> references/nope.md",
    ]);
    // The rename case this exists to catch: right directory, wrong file name.
    expect(danglingLinks(root, [{ path: referenceFile, text: "[rules](executlon.md)" }])).toEqual([
      "skills/team/references/a.md -> executlon.md",
    ]);

    // Each exclusion, proven to exclude.
    expect(danglingLinks(root, [{ path: skillFile, text: "[x](https://example.com/a.md)" }])).toEqual([]);
    expect(danglingLinks(root, [{ path: skillFile, text: "`[x](nope.md)`" }])).toEqual([]);
    expect(danglingLinks(root, [{ path: skillFile, text: "[x](<resolved-url>)" }])).toEqual([]);
    expect(danglingLinks(root, [{ path: skillFile, text: "[x](#a-section)" }])).toEqual([]);
  });
});
