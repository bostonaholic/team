// tests/helpers/fixtures.ts
//
// Loaders for the on-disk fixture artifacts under evals/fixtures/<agent>/<case>/.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface GroundTruthBug {
  id: string;
  category?: string;
  severity?: string;
  description: string;
  detection_hint: string;
}

export interface GroundTruth {
  bugs: GroundTruthBug[];
  minimum_detection: number;
  max_false_positives?: number;
}

export interface FixtureFrontmatter {
  agent: string;
  tier: "gate" | "periodic";
  deps: string[];
}

export interface Fixture {
  frontmatter: FixtureFrontmatter;
  body: string;
  groundTruth: GroundTruth;
}

const TIERS = ["gate", "periodic"] as const;
type Tier = (typeof TIERS)[number];

function parseFrontmatter(text: string): { frontmatter: FixtureFrontmatter; body: string } {
  if (!text.startsWith("---")) {
    throw new Error("fixture: missing YAML frontmatter");
  }
  const end = text.indexOf("\n---", 3);
  if (end < 0) throw new Error("fixture: unterminated frontmatter");
  const block = text.slice(3, end);
  const body = text.slice(end + 4).replace(/^\r?\n/, "");
  const lines = block.split(/\r?\n/);

  let agent: string | null = null;
  let tier: string | null = null;
  const deps: string[] = [];
  let depsSeen = false;
  let inDeps = false;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (inDeps) {
      const itemMatch = /^\s+-\s+(.*)$/.exec(line);
      if (itemMatch) {
        const value = itemMatch[1];
        if (value !== undefined) deps.push(value.trim().replace(/^["']|["']$/g, ""));
        continue;
      }
      if (/^[A-Za-z0-9_-]+:/.test(line) || /^\s*$/.test(line)) {
        inDeps = false;
      } else {
        throw new Error(`fixture: unexpected line in deps: ${line}`);
      }
    }
    const depsMatch = /^deps:\s*(.*)$/.exec(line);
    if (depsMatch) {
      depsSeen = true;
      const trailing = depsMatch[1]?.trim() ?? "";
      if (trailing === "") inDeps = true;
      else throw new Error("fixture: deps must be a YAML list");
      continue;
    }
    const agentMatch = /^agent:\s*(.+?)\s*$/.exec(line);
    if (agentMatch) agent = agentMatch[1] ?? null;
    const tierMatch = /^tier:\s*(.+?)\s*$/.exec(line);
    if (tierMatch) tier = tierMatch[1] ?? null;
  }

  if (agent === null) throw new Error("fixture: missing required field: agent");
  if (tier === null) throw new Error("fixture: missing required field: tier");
  if (!(TIERS as readonly string[]).includes(tier)) {
    throw new Error(`fixture: tier must be one of ${TIERS.join("|")}; got '${tier}'`);
  }
  // `deps` is load-bearing for diff-based selection: a fixture with no deps
  // would never match a changed file and would be silently skipped unless
  // EVALS_ALL=1. Require the field to be present and non-empty so that
  // omission fails loudly at load time rather than vanishing from runs.
  if (!depsSeen) throw new Error("fixture: missing required field: deps");
  if (deps.length === 0) {
    throw new Error("fixture: deps must list at least one glob (got empty list)");
  }
  return {
    frontmatter: { agent, tier: tier as Tier, deps },
    body,
  };
}

function validateGroundTruth(value: unknown): GroundTruth {
  if (typeof value !== "object" || value === null) {
    throw new Error("ground-truth: must be a JSON object");
  }
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.bugs)) {
    throw new Error("ground-truth: required field 'bugs' must be an array");
  }
  if (typeof v.minimum_detection !== "number") {
    throw new Error("ground-truth: required field 'minimum_detection' must be a number");
  }
  return v as unknown as GroundTruth;
}

export function loadFixture(agent: string, caseName: string, fixtureRoot?: string): Fixture {
  const root = fixtureRoot ?? join(process.cwd(), "evals", "fixtures");
  const inputPath = join(root, agent, caseName, "input.md");
  const groundTruthPath = join(root, agent, caseName, "ground-truth.json");
  const inputText = readFileSync(inputPath, "utf8");
  const { frontmatter, body } = parseFrontmatter(inputText);
  const groundTruth = validateGroundTruth(JSON.parse(readFileSync(groundTruthPath, "utf8")));
  return { frontmatter, body, groundTruth };
}
