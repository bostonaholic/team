#!/usr/bin/env node
// Owns the agent-config rules over agents/*.md and skills/team/registry.json. It reads and never writes.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = "check-agents";
const USAGE = "usage: check-agents.mjs [--root <dir>]";
const REGISTRY_PATH = "skills/team/registry.json";
const AGENTS_DIR = "agents";

const CODE_REVIEW_DISPATCH = "skills/team-code-review/references/02-execution.md step 3";
const SECURITY_REVIEW_DISPATCH = "skills/team-security-review/references/02-execution.md step 3 delta";
// A copy of the reviewers the review skills dispatch by name; change it with the AGENTS.md reviewer list.
const REVIEWERS = [
  { name: "code-reviewer", phase: "CODE REVIEW", dispatch: CODE_REVIEW_DISPATCH },
  { name: "technical-writer", phase: "CODE REVIEW", dispatch: CODE_REVIEW_DISPATCH },
  { name: "ux-reviewer", phase: "CODE REVIEW", dispatch: CODE_REVIEW_DISPATCH },
  { name: "verifier", phase: "CODE REVIEW", dispatch: CODE_REVIEW_DISPATCH },
  { name: "security-reviewer", phase: "SECURITY REVIEW", dispatch: SECURITY_REVIEW_DISPATCH },
];
const REVIEW_PHASES = ["CODE REVIEW", "SECURITY REVIEW"];
const REVIEWER_TOOLS = ["Read", "Grep", "Glob", "Bash", "TodoWrite", "Agent", "SendMessage"];
const SECURITY_REVIEWER = "security-reviewer";
const SECURITY_REVIEWER_MODEL = "opus";
const REVIEWER_PERMISSION_MODE = "plan";

const RULES = [
  "registry-json",
  "agent-frontmatter",
  "registry-sync",
  "reviewer-set",
  "reviewer-tools",
  "reviewer-permission-mode",
  "security-reviewer-model",
];
const SOURCE_AGENTS = "(AGENTS.md, Agents (13))";
const SOURCE_BALANCES = "(AGENTS.md, checks and balances)";

const KEY_LINE = /^[A-Za-z][A-Za-z0-9_-]*:( .*)?$/;
// YAML 1.1 parsers read these as line breaks, so a value holding one can hide a second key.
const YAML_LINE_BREAKS = /[\u0085\u2028\u2029]/;
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const YAML_RESERVED_SCALARS = ["y", "yes", "n", "no", "true", "false", "on", "off", "null"];
const BARE_TOOL_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const ACCEPTED_TOOLS_FORM = "tools: Read, Grep, Glob";

class UsageError extends Error {}

const violation = (rule, path, detail) => ({ rule, path, detail });

function parseRoot(argv) {
  let root;
  for (let at = 0; at < argv.length; at += 2) {
    const name = argv[at];
    const value = argv[at + 1];
    if (name !== "--root") throw new UsageError(`unknown argument: ${name}`);
    if (value === undefined || value.startsWith("--")) throw new UsageError(`${name} needs a value`);
    if (root !== undefined) throw new UsageError(`${name} given twice`);
    root = value;
  }
  if (root === undefined) return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) throw new UsageError(`--root is not a directory: ${root}`);
  return resolve(root);
}

function readRegistry(root) {
  const violations = [];
  const fail = (detail) => violations.push(violation("registry-json", REGISTRY_PATH, `${detail} ${SOURCE_AGENTS}`));
  const invalid = () => ({ valid: false, phases: new Map(), violations });

  let text;
  try {
    text = readFileSync(join(root, REGISTRY_PATH), "utf8");
  } catch (error) {
    fail(error.code === "ENOENT" ? "the registry is absent" : `the registry cannot be read (${error.code})`);
    return invalid();
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    fail(`the registry is not JSON: ${error.message}`);
    return invalid();
  }
  if (!Array.isArray(data?.agents)) {
    fail("the registry has no agents array");
    return invalid();
  }

  const phases = new Map();
  data.agents.forEach((entry, index) => {
    const name = entry?.name;
    if (typeof name !== "string" || name === "") return fail(`agents[${index}] has no non-empty string name`);
    if (phases.has(name)) return fail(`agents[${index}] repeats the name ${name}`);
    phases.set(name, entry.phase);
  });
  return violations.length === 0 ? { valid: true, phases, violations } : invalid();
}

function scanAgentFiles(root) {
  let names;
  try {
    names = readdirSync(join(root, AGENTS_DIR));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return names
    .filter((name) => name.endsWith(".md") && !name.startsWith("."))
    .sort(byteOrder)
    .map((name) => ({ stem: name.slice(0, -".md".length), path: `${AGENTS_DIR}/${name}` }));
}

// Returns the first value of each key, or null when the frontmatter block cannot be read or delimited.
function readFrontmatter(root, file) {
  const violations = [];
  const fail = (detail) => violations.push(violation("agent-frontmatter", file.path, `${detail} ${SOURCE_AGENTS}`));

  let text;
  try {
    text = readFileSync(join(root, file.path), "utf8");
  } catch (error) {
    fail(`the file cannot be read (${error.code})`);
    return { keys: null, violations };
  }
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0] !== "---") {
    fail("line 1 is not ---");
    return { keys: null, violations };
  }
  const closing = lines.indexOf("---", 1);
  if (closing < 0) {
    fail("no line after line 1 is exactly ---");
    return { keys: null, violations };
  }

  const keys = new Map();
  for (let at = 1; at < closing; at += 1) {
    const line = lines[at];
    const lineNumber = at + 1;
    if (YAML_LINE_BREAKS.test(line)) {
      fail(`line ${lineNumber} holds U+0085, U+2028, or U+2029, which YAML reads as a line break`);
      continue;
    }
    if (!KEY_LINE.test(line)) {
      fail(`line ${lineNumber} is not a one-line top-level key: ${JSON.stringify(line)}`);
      continue;
    }
    const colon = line.indexOf(":");
    const key = line.slice(0, colon);
    if (keys.has(key)) {
      fail(`line ${lineNumber} repeats the key ${key}`);
      continue;
    }
    keys.set(key, line.slice(colon + 1));
  }

  const name = keys.get("name");
  if (name === undefined) {
    fail("name is absent");
  } else {
    const value = scalar(name);
    if (value !== file.stem) fail(`name is ${JSON.stringify(value)}, but the file stem is ${JSON.stringify(file.stem)}`);
    if (!KEBAB_CASE.test(value)) fail(`name ${JSON.stringify(value)} is not lowercase kebab-case`);
    if (YAML_RESERVED_SCALARS.includes(value)) fail(`name ${JSON.stringify(value)} is a YAML 1.1 reserved scalar`);
  }
  return { keys, violations };
}

function scalar(raw) {
  const value = raw.trim();
  const quote = value[0];
  const quoted = value.length >= 2 && (quote === '"' || quote === "'") && value.at(-1) === quote;
  return quoted ? value.slice(1, -1) : value;
}

function checkRegistrySync(files, phases) {
  const stems = new Set(files.map((file) => file.stem));
  const violations = files
    .filter((file) => !phases.has(file.stem))
    .map((file) => violation("registry-sync", file.path, `${file.stem} has no entry in ${REGISTRY_PATH} ${SOURCE_AGENTS}`));
  for (const name of phases.keys()) {
    if (!stems.has(name)) {
      violations.push(violation("registry-sync", REGISTRY_PATH, `${name} has no ${AGENTS_DIR}/${name}.md ${SOURCE_AGENTS}`));
    }
  }
  return violations;
}

function checkReviewerSet(phases) {
  const violations = [];
  const fail = (detail) => violations.push(violation("reviewer-set", REGISTRY_PATH, detail));
  for (const reviewer of REVIEWERS) {
    if (!phases.has(reviewer.name)) {
      fail(`${reviewer.name} is in the reviewer table but has no registry entry (${reviewer.dispatch})`);
    } else if (phases.get(reviewer.name) !== reviewer.phase) {
      fail(
        `${reviewer.name} has phase ${phases.get(reviewer.name)}, but the reviewer table pins it to ${reviewer.phase} (${reviewer.dispatch})`,
      );
    }
  }
  const tableNames = new Set(REVIEWERS.map((reviewer) => reviewer.name));
  for (const [name, phase] of phases) {
    if (REVIEW_PHASES.includes(phase) && !tableNames.has(name)) {
      fail(`${name} has phase ${phase}, but the reviewer table in .claude/scripts/check-agents.mjs has no row for it ${SOURCE_BALANCES}`);
    }
  }
  return violations;
}

function reviewerNames(registry) {
  const names = new Set(REVIEWERS.map((reviewer) => reviewer.name));
  for (const [name, phase] of registry.phases) {
    if (REVIEW_PHASES.includes(phase)) names.add(name);
  }
  return names;
}

function checkReviewerTools(path, raw) {
  const fail = (detail) => violation("reviewer-tools", path, `${detail} ${SOURCE_BALANCES}`);
  if (raw === undefined) return [fail(`tools is absent, which grants every tool. Use the form ${ACCEPTED_TOOLS_FORM}`)];
  const value = raw.trim();
  if (value === "") return [fail(`tools is empty. Use the form ${ACCEPTED_TOOLS_FORM}`)];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => !REVIEWER_TOOLS.includes(entry))
    .map((entry) =>
      BARE_TOOL_NAME.test(entry)
        ? fail(`tools entry ${JSON.stringify(entry)} is outside the reviewer allowlist ${REVIEWER_TOOLS.join(", ")}`)
        : fail(
            `tools entry ${JSON.stringify(entry)} is not a bare tool name. Use the form ${ACCEPTED_TOOLS_FORM}, with names from the reviewer allowlist ${REVIEWER_TOOLS.join(", ")}`,
          ),
    );
}

function checkPermissionMode(path, raw) {
  const value = raw === undefined ? "absent" : scalar(raw);
  if (value === REVIEWER_PERMISSION_MODE) return [];
  return [
    violation(
      "reviewer-permission-mode",
      path,
      `permissionMode is ${value}, but a reviewer must declare ${REVIEWER_PERMISSION_MODE} ${SOURCE_BALANCES}`,
    ),
  ];
}

function checkSecurityReviewerModel(path, raw) {
  const value = raw === undefined ? "absent" : scalar(raw);
  if (value === SECURITY_REVIEWER_MODEL) return [];
  return [
    violation(
      "security-reviewer-model",
      path,
      `model is ${value}, but ${SECURITY_REVIEWER} stays on ${SECURITY_REVIEWER_MODEL} ${SOURCE_AGENTS}`,
    ),
  ];
}

function byteOrder(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

// Registry lines first, then agent files in byte order, then rules in table order; ties keep insertion order.
function compareViolations(a, b) {
  const group = (item) => (item.path === REGISTRY_PATH ? 0 : 1);
  return group(a) - group(b) || byteOrder(a.path, b.path) || RULES.indexOf(a.rule) - RULES.indexOf(b.rule);
}

function checkTree(root) {
  const registry = readRegistry(root);
  const files = scanAgentFiles(root);
  const reviewers = reviewerNames(registry);
  const violations = [...registry.violations];

  if (registry.valid) {
    violations.push(...checkRegistrySync(files, registry.phases), ...checkReviewerSet(registry.phases));
  }
  for (const file of files) {
    const frontmatter = readFrontmatter(root, file);
    violations.push(...frontmatter.violations);
    if (frontmatter.keys === null) continue;
    if (reviewers.has(file.stem)) {
      violations.push(
        ...checkReviewerTools(file.path, frontmatter.keys.get("tools")),
        ...checkPermissionMode(file.path, frontmatter.keys.get("permissionMode")),
      );
    }
    if (file.stem === SECURITY_REVIEWER) {
      violations.push(...checkSecurityReviewerModel(file.path, frontmatter.keys.get("model")));
    }
  }
  return { violations: violations.sort(compareViolations), fileCount: files.length, reviewerCount: reviewers.size };
}

function main(argv) {
  const { violations, fileCount, reviewerCount } = checkTree(parseRoot(argv));
  if (violations.length > 0) {
    for (const { rule, path, detail } of violations) process.stderr.write(`${SCRIPT}: ${rule}: ${path}: ${detail}\n`);
    process.stderr.write(`${SCRIPT}: ${violations.length} violation(s)\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `OK: ${fileCount} agents match ${REGISTRY_PATH}, ${reviewerCount} reviewers hold only allowlisted tools\n`,
  );
}

try {
  main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  process.stderr.write(`${SCRIPT}: ${error.message}\n${USAGE}\n`);
  process.exitCode = 2;
}
