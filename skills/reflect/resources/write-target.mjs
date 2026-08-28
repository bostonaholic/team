#!/usr/bin/env node

/**
 * Where an approved skill edit is allowed to land, and whether a proposed
 * skill name may be used at all.
 *
 *     node "<skill-dir>/resources/write-target.mjs" <repo-root> <skill-name>
 *
 * Every input here comes from transcript text, so it is untrusted. The three
 * checks below are `f(input) -> output`, which is why they are code rather
 * than prose in the skill body: a name pattern and a containment rule stated
 * as advice are neither deterministic nor testable. Imports nothing from
 * resolve-transcript.mjs — one job each.
 */

import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Every skill directory on disk matches this shape, so it is the pattern to
 * hold a proposed name to. Deliberately narrower than a general filename
 * allowlist, which admits `.hidden` and `foo.bar`: a leading dot hides the
 * directory from the host's own skill discovery, and a dot inside the name
 * has no precedent to follow.
 */
const SKILL_NAME = /^[a-z][a-z0-9-]*$/;

export function isValidSkillName(name) {
  return typeof name === "string" && SKILL_NAME.test(name);
}

/**
 * The real path of `candidatePath`, resolving the deepest ancestor that
 * exists and re-appending the components that do not. A create target's final
 * component never exists yet, so resolving only existing paths would exempt
 * exactly the case that matters.
 */
function realPathOfDeepestExisting(candidatePath) {
  let current = resolve(candidatePath);
  const missing = [];
  for (;;) {
    if (existsSync(current)) return join(realpathSync(current), ...[...missing].reverse());
    const parent = dirname(current);
    if (parent === current) return resolve(candidatePath);
    missing.push(basename(current));
    current = parent;
  }
}

/**
 * True only when the resolved real path stays inside `repoRoot`. Resolution is
 * what makes this a real check: a symlinked directory inside the repo can
 * point anywhere, so a prefix test on the unresolved path would authorize a
 * write outside the repository the user approved.
 */
export function isInsideRepo(query) {
  const { candidatePath, repoRoot } = query ?? {};
  if (typeof candidatePath !== "string" || typeof repoRoot !== "string") return false;
  if (!existsSync(repoRoot)) return false;
  const root = realpathSync(resolve(repoRoot));
  const target = realPathOfDeepestExisting(candidatePath);
  return target === root || target.startsWith(root + sep);
}

/** True when the repo carries `.claude-plugin/plugin.json` or `plugin.json`. */
export function hasPluginMarker(repoRoot) {
  if (typeof repoRoot !== "string") return false;
  return (
    existsSync(join(repoRoot, ".claude-plugin", "plugin.json")) ||
    existsSync(join(repoRoot, "plugin.json"))
  );
}

/**
 * The skills root the running host actually loads, which is the copy an edit
 * has to reach to change anything. A repo carrying a plugin marker is a plugin
 * root, and its host reads `<repo>/skills/`; every other repo is a project, and
 * its host reads `<repo>/.claude/skills/`. The probe is injected so the
 * tie-break itself stays pure.
 *
 * This decides where an EDIT lands. Creation is not symmetrical: a new skill
 * only ever goes to `<repo>/.claude/skills/<name>/SKILL.md`, because adding a
 * file to a distributed plugin's own `skills/` directory is a release decision.
 */
export function preferredEditRoot(query) {
  const repoRoot = query?.repoRoot ?? "";
  return query?.hasPluginMarker
    ? join(repoRoot, "skills")
    : join(repoRoot, ".claude", "skills");
}

// CLI entry point — runs only when executed directly, never on import, so a
// test import has no side effects (the supports-nesting.mjs shape).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = process.argv[2] ?? "";
  const name = process.argv[3] ?? "";

  if (!repoRoot || !name) {
    process.stderr.write("usage: write-target.mjs <repo-root> <skill-name>\n");
    process.exit(1);
  }

  if (!isValidSkillName(name)) {
    process.stderr.write(`refusing: '${name}' is not a valid skill name\n`);
    process.exit(1);
  }

  const editRoot = preferredEditRoot({ repoRoot, hasPluginMarker: hasPluginMarker(repoRoot) });
  const editTarget = join(editRoot, name, "SKILL.md");
  const createTarget = join(repoRoot, ".claude", "skills", name, "SKILL.md");

  for (const [label, target] of [
    ["edit target", editTarget],
    ["create target", createTarget],
  ]) {
    if (!isInsideRepo({ candidatePath: target, repoRoot })) {
      process.stderr.write(`refusing: ${label} resolves outside the repository\n`);
      process.exit(1);
    }
  }

  process.stdout.write(`edit root: ${editRoot}\n`);
  process.stdout.write(`edit target: ${editTarget}\n`);
  process.stdout.write(`edit target exists: ${existsSync(editTarget)}\n`);
  process.stdout.write(`create target: ${createTarget}\n`);
  process.stdout.write(`create target exists: ${existsSync(createTarget)}\n`);
}
