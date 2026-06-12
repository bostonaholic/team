/**
 * skill-contract.ts — pure static checks for a SKILL.md document.
 *
 * No spawn, no LLM. Validates the structural contract a skill must satisfy:
 *   - a SKILL.md exists in the skill directory,
 *   - its frontmatter carries the required keys,
 *   - each required section appears as a `## ` heading in the body,
 *   - every repo-relative path referenced in the body actually resolves.
 *
 * Errors are collected and returned — content problems never throw.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

export interface SkillFrontmatter {
  meta: Record<string, string>;
  body: string;
}

/**
 * Parse simple `key: value` YAML frontmatter delimited by `---` fences.
 * Mirrors the lightweight parser in fixtures.ts — no external YAML dependency.
 */
export function parseSkillFrontmatter(text: string): SkillFrontmatter {
  const meta: Record<string, string> = {};
  if (!text.startsWith("---")) {
    return { meta, body: text };
  }
  const end = text.indexOf("\n---", 3);
  if (end === -1) {
    return { meta, body: text };
  }
  const fm = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\n/, "");
  for (const line of fm.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }
  return { meta, body };
}

export interface SkillContractOptions {
  /** Absolute path to the skill directory containing SKILL.md. */
  skillDir: string;
  /** Section titles that must appear as `## ` headings in the body. */
  requiredSections: string[];
  /** Frontmatter keys that must be present (defaults to name + description). */
  requiredFrontmatter?: string[];
  /**
   * Repo root that body path references resolve against. Defaults to two
   * levels above skillDir (the `skills/<name>` convention).
   */
  repoRoot?: string;
}

export interface SkillContractResult {
  ok: boolean;
  errors: string[];
}

const DEFAULT_FRONTMATTER = ["name", "description"];

/**
 * Detect repo-relative path references in the body. We only flag backtick-
 * quoted tokens that look like a concrete repo-relative path: they must
 * contain a directory separator and carry no template markers (`<id>`,
 * `$ARGUMENTS`, `*` globs) or whitespace. Bare artifact names without a
 * slash (e.g. `structure.md`) are conceptual references, not file paths,
 * and are intentionally skipped — as are absolute paths, URLs (anything
 * with a `scheme://` prefix), and git refspecs like `origin/HEAD` /
 * `origin/main`, none of which name a file in the tree.
 */
function referencedPaths(body: string): string[] {
  const refs = new Set<string>();
  const backtick = /`([^`]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = backtick.exec(body)) !== null) {
    const token = match[1];
    if (token === undefined) continue;
    const trimmed = token.trim();
    if (trimmed.length === 0) continue;
    if (/[<>$*\s]/.test(trimmed)) continue;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) continue; // URL, not a path
    if (/^origin\//.test(trimmed)) continue; // git refspec, not a path
    if (isAbsolute(trimmed)) continue;
    if (!trimmed.includes("/")) continue;
    refs.add(trimmed);
  }
  return [...refs];
}

export function checkSkillContract(
  opts: SkillContractOptions,
): SkillContractResult {
  const { skillDir, requiredSections } = opts;
  const requiredFrontmatter = opts.requiredFrontmatter ?? DEFAULT_FRONTMATTER;
  const repoRoot = opts.repoRoot ?? dirname(dirname(skillDir));
  const errors: string[] = [];

  const skillPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillPath)) {
    errors.push(`SKILL.md not found in ${skillDir}`);
    return { ok: false, errors };
  }

  const raw = readFileSync(skillPath, "utf8");
  const { meta, body } = parseSkillFrontmatter(raw);

  for (const key of requiredFrontmatter) {
    const value = meta[key];
    if (value === undefined || value.length === 0) {
      errors.push(`Missing frontmatter key: ${key}`);
    }
  }

  const headings = new Set(
    body
      .split("\n")
      .filter((line) => line.startsWith("## "))
      .map((line) => line.slice(3).trim()),
  );
  for (const section of requiredSections) {
    if (!headings.has(section)) {
      errors.push(`Missing required section: ## ${section}`);
    }
  }

  for (const ref of referencedPaths(body)) {
    const resolvesInSkillDir = existsSync(join(skillDir, ref));
    const resolvesInRepo = existsSync(join(repoRoot, ref));
    if (!resolvesInSkillDir && !resolvesInRepo) {
      errors.push(`Referenced path does not resolve: ${ref}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
