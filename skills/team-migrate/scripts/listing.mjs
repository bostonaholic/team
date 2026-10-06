// Turns one host listing, read as JSON from stdin, into records on stdout, one
// per line with fields split by the ASCII unit separator (0x1f), so the shell
// scripts beside it never parse JSON.
//
//   usage: node listing.mjs <kind> < listing
//
//   claude-marketplaces  `claude plugin marketplace list --json`
//                        -> <name> <source> <location>   (path, repo, or url)
//   claude-plugins       `claude plugin list --json`
//                        -> <id> <scope> <version> <enabled>
//   claude-session       `claude -p --output-format stream-json --verbose`
//                        -> skill <name> | plugin <id>   (from the init event)
//   codex-marketplaces   `codex plugin marketplace list --json`
//                        -> <name> <sourceType> <source> <root>
//   codex-plugins        `codex plugin list --json`
//                        -> <id> <version>               (installed only)
//   codex-prompt         `codex debug prompt-input <text>`
//                        -> <skill name>                 (as the model sees it)
//   plugin-version       a plugin.json
//                        -> <version>
//   skill-lock           `~/.agents/.skill-lock.json`, written by npx skills
//                        -> <skill name>
//   collection-skills    a plugin.json listing its skills
//                        -> <path>                       (relative, no `..`)
//
// Exit codes: 0 records printed, 1 unreadable listing or a field holding a
// separator or newline, 2 usage.

import { readFileSync } from "node:fs";

const KINDS = {
  "claude-marketplaces": (json) =>
    json.map((entry) => [entry.name, entry.source, entry.path ?? entry.repo ?? entry.url ?? ""]),
  "claude-plugins": (json) =>
    json.map((entry) => [entry.id, entry.scope, entry.version ?? "", String(entry.enabled ?? true)]),
  "claude-session": (lines) => {
    const init = lines.find((event) => event.type === "system" && event.subtype === "init");
    if (!init) throw new Error("no init event in the session output");
    return [
      ...(init.skills ?? []).map((skill) => ["skill", typeof skill === "string" ? skill : skill.name]),
      ...(init.plugins ?? []).map((plugin) => ["plugin", plugin.source ?? plugin.name]),
    ];
  },
  "codex-marketplaces": (json) =>
    (json.marketplaces ?? json).map((entry) => [
      entry.name,
      entry.marketplaceSource?.sourceType ?? "",
      entry.marketplaceSource?.source ?? "",
      entry.root ?? "",
    ]),
  "codex-plugins": (json) =>
    (json.installed ?? json).filter((entry) => entry.installed).map((entry) => [entry.pluginId, entry.version ?? ""]),
  "codex-prompt": (json) =>
    json
      .flatMap((item) => item.content ?? [])
      .flatMap((part) => String(part.text ?? "").split("\n"))
      .map((line) => /^- (\S+?): .*\(file: [^)]*\)$/.exec(line))
      .filter(Boolean)
      .map((match) => [match[1]]),
  "plugin-version": (json) => [[json.version ?? ""]],
  "skill-lock": (json) => Object.keys(json.skills ?? {}).map((name) => [name]),
  "collection-skills": (json) =>
    (json.skills ?? []).map((path) => {
      if (!/^\.\/skills(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)+$/.test(path)) throw new Error(`unsafe skill path ${path}`);
      return [path.slice(2)];
    }),
};

const kind = process.argv[2];
if (!KINDS[kind] || process.argv.length !== 3) {
  process.stderr.write(`usage: node listing.mjs <${Object.keys(KINDS).join("|")}>\n`);
  process.exit(2);
}

try {
  const text = readFileSync(0, "utf8");
  const input = kind === "claude-session"
    ? text.split("\n").filter((line) => line.trim().startsWith("{")).map((line) => JSON.parse(line))
    : JSON.parse(text);
  for (const record of KINDS[kind](input)) {
    const fields = record.map((field) => String(field ?? ""));
    if (fields.some((field) => /[\x1f\n\r]/.test(field))) throw new Error("a listing field holds a separator or newline");
    process.stdout.write(`${fields.join("\x1f")}\n`);
  }
} catch (error) {
  process.stderr.write(`listing.mjs: ${kind}: ${error.message}\n`);
  process.exit(1);
}
