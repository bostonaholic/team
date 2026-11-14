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
//   codex-marketplaces   `codex plugin marketplace list --json`
//                        -> <name> <sourceType> <source> <root>
//   codex-plugins        `codex plugin list --json`
//                        -> <id> <version>               (installed only)
//   plugin-version       a plugin.json
//                        -> <version>
//
// Exit codes: 0 records printed, 1 unreadable listing or a field holding a
// separator or newline, 2 usage.

import { readFileSync } from "node:fs";

const KINDS = {
  "claude-marketplaces": (json) =>
    json.map((entry) => [entry.name, entry.source, entry.path ?? entry.repo ?? entry.url ?? ""]),
  "claude-plugins": (json) =>
    json.map((entry) => [entry.id, entry.scope, entry.version ?? "", String(entry.enabled ?? true)]),
  "codex-marketplaces": (json) =>
    (json.marketplaces ?? json).map((entry) => [
      entry.name,
      entry.marketplaceSource?.sourceType ?? "",
      entry.marketplaceSource?.source ?? "",
      entry.root ?? "",
    ]),
  "codex-plugins": (json) =>
    (json.installed ?? json).filter((entry) => entry.installed).map((entry) => [entry.pluginId, entry.version ?? ""]),
  "plugin-version": (json) => [[json.version ?? ""]],
};

const kind = process.argv[2];
if (!KINDS[kind] || process.argv.length !== 3) {
  process.stderr.write(`usage: node listing.mjs <${Object.keys(KINDS).join("|")}>\n`);
  process.exit(2);
}

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  for (const record of KINDS[kind](input)) {
    const fields = record.map((field) => String(field ?? ""));
    if (fields.some((field) => /[\x1f\n\r]/.test(field))) throw new Error("a listing field holds a separator or newline");
    process.stdout.write(`${fields.join("\x1f")}\n`);
  }
} catch (error) {
  process.stderr.write(`listing.mjs: ${kind}: ${error.message}\n`);
  process.exit(1);
}
