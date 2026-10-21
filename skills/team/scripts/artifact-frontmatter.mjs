// Shared helpers for the team scripts that write orchestrator-owned artifacts
// under docs/plans/<id>/. Imported only; it has no CLI.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Every artifact in one directory carries the same topic, so the first one
// present supplies it; 2-questions.md leads because research copies from it.
const TOPIC_SOURCES = ["2-questions.md", "1-task.md", "5-research.md", "6-design.md", "7-structure.md", "8-plan.md"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class UsageError extends Error {}

export function frontmatterLines(text) {
  const lines = text.split("\n");
  const closing = lines.indexOf("---", 1);
  if (lines[0] !== "---" || closing < 0) return null;
  return lines.slice(1, closing);
}

export function readTopic(dir) {
  if (!existsSync(dir)) throw new Error(`artifact directory not found: ${dir}`);
  for (const name of TOPIC_SOURCES) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    const lines = frontmatterLines(readFileSync(path, "utf8"));
    const match = lines?.map((line) => line.match(/^topic:[ \t]*(\S.*?)[ \t]*$/)).find(Boolean);
    if (match) return match[1];
  }
  throw new Error(`no topic in the frontmatter of any of ${TOPIC_SOURCES.join(", ")} under ${dir}`);
}

export function resolveDate(override, now = new Date()) {
  if (override === undefined) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  if (!ISO_DATE.test(override)) throw new UsageError(`--date must be YYYY-MM-DD, got ${override}`);
  return override;
}

// Parses `--name value` pairs; every flag takes a value and may appear once.
export function parseFlags(argv, allowed) {
  const flags = {};
  for (let at = 0; at < argv.length; at += 2) {
    const name = argv[at];
    const value = argv[at + 1];
    if (!allowed.includes(name)) throw new UsageError(`unknown argument: ${name}`);
    if (value === undefined || value.startsWith("--")) throw new UsageError(`${name} needs a value`);
    if (name in flags) throw new UsageError(`${name} given twice`);
    flags[name] = value;
  }
  return flags;
}

export function requireFlags(flags, names) {
  const missing = names.filter((name) => !(name in flags));
  if (missing.length > 0) throw new UsageError(`missing ${missing.join(", ")}`);
}

export function readInput(path, label) {
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`);
  return readFileSync(path, "utf8");
}

// Exit 2 for usage errors and 1 for every other failure, each named on stderr.
export function runCli(script, usage, main) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${script}: ${error.message}\n`);
    if (error instanceof UsageError) process.stderr.write(`${usage}\n`);
    process.exit(error instanceof UsageError ? 2 : 1);
  }
}
