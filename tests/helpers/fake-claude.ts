// tests/helpers/fake-claude.ts
//
// A stand-in for the `claude` binary, for the Claude Code dev-install tests.
// It models the parts of `claude plugin` that script/dev-install-claude drives:
// marketplace registration, install/update, and the JSON listings the script
// reads back. State lives under $HOME, so every test isolates with
// HOME=<tempdir>, and each invocation is appended to $HOME/state/calls.
//
// Three behaviors here were measured against the real CLI on 2026-09-10 and
// are what make the cachebuster loop necessary. A fake that got any of them
// wrong would let a broken installer pass:
//
//   1. The catalog is a SNAPSHOT. `plugin install` and `plugin update` read the
//      version recorded when the marketplace was last added or updated, not
//      whatever the source manifest says right now.
//   2. `plugin update` NO-OPS when the catalog version equals the installed
//      one. Editing a skill without moving the version leaves the cached copy
//      untouched: "Plugin is already at the latest version."
//   3. The install is a COPY into a directory named for the version, with `+`
//      rewritten to `-`. The version Claude reports keeps its `+`, so the
//      reported version and the directory name differ by that one character.

import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STUB = `#!/usr/bin/env bash
set -euo pipefail

STATE="$HOME/state"
CACHE="$HOME/.claude/plugins/cache/team-dev/team"
mkdir -p "$STATE"
printf '%s\\n' "$*" >> "$STATE/calls"

# Test knob: fail one subcommand, so a caller can exercise a mid-run abort.
# Set it to the first three words of the call, e.g. "plugin install team@team-dev".
if [ -n "\${FAKE_CLAUDE_FAIL:-}" ] && [ "\${FAKE_CLAUDE_FAIL}" = "$1 $2 $3" ]; then
  echo "fake claude: forced failure for '$1 $2 $3'" >&2
  exit 1
fi

# The version the marketplace catalog carries. Claude snapshots it at
# 'marketplace add' / 'marketplace update' time, so a later source edit is
# invisible until one of those runs again.
snapshot_catalog() {
  local root="$1"
  node -p "require('$root/.claude-plugin/marketplace.json').plugins[0].version" > "$STATE/catalog-version"
}

# Claude's cache directory is named for the version with '+' rewritten to '-'.
sanitize() { printf '%s' "\${1//+/-}"; }

copy_into_cache() {
  local version="$1" root dir
  root=$(<"$STATE/marketplace-path")
  dir="$CACHE/$(sanitize "$version")"
  rm -rf "$dir"
  mkdir -p "$dir"
  cp -R "$root/.claude-plugin" "$dir/.claude-plugin"
  [ -d "$root/skills" ] && cp -R "$root/skills/" "$dir/skills"
  printf '%s' "$version" > "$STATE/installed-version"
}

case "$1 $2 $3" in
  "plugin marketplace list")
    if [ -f "$STATE/marketplace-path" ]; then
      path=$(<"$STATE/marketplace-path")
      printf '[{"name":"team-dev","source":"directory","path":"%s"}]\\n' "$path"
    else
      printf '[]\\n'
    fi
    ;;
  "plugin marketplace add")
    if [ -f "$STATE/marketplace-path" ]; then
      echo "Marketplace 'team-dev' is already installed" >&2
      exit 1
    fi
    printf '%s' "$4" > "$STATE/marketplace-path"
    snapshot_catalog "$4"
    ;;
  "plugin marketplace update")
    [ -f "$STATE/marketplace-path" ] || { echo "No such marketplace: team-dev" >&2; exit 1; }
    snapshot_catalog "$(<"$STATE/marketplace-path")"
    ;;
  "plugin install team@team-dev")
    if [ -f "$STATE/installed-version" ]; then
      echo "Plugin 'team@team-dev' is already installed" >&2
      exit 1
    fi
    copy_into_cache "$(<"$STATE/catalog-version")"
    ;;
  "plugin update team@team-dev")
    catalog=$(<"$STATE/catalog-version")
    installed=""
    [ -f "$STATE/installed-version" ] && installed=$(<"$STATE/installed-version")
    if [ "$catalog" = "$installed" ]; then
      echo "team is already at the latest version ($catalog)."
      exit 0
    fi
    copy_into_cache "$catalog"
    ;;
  "plugin uninstall team@team-dev")
    [ -f "$STATE/installed-version" ] || { echo "Plugin 'team@team-dev' is not installed" >&2; exit 1; }
    rm -rf "$CACHE/$(sanitize "$(<"$STATE/installed-version")")"
    rm -f "$STATE/installed-version"
    ;;
  "plugin marketplace remove")
    [ -f "$STATE/marketplace-path" ] || { echo "No such marketplace: team-dev" >&2; exit 1; }
    rm -f "$STATE/marketplace-path" "$STATE/catalog-version"
    ;;
  "plugin list --json")
    if [ -f "$STATE/installed-version" ]; then
      version=$(<"$STATE/installed-version")
      printf '[{"id":"team@team-dev","version":"%s","scope":"user","installPath":"%s/%s"}]\\n' \\
        "$version" "$CACHE" "$(sanitize "$version")"
    else
      printf '[]\\n'
    fi
    ;;
  *)
    echo "Unexpected claude call: $*" >&2
    exit 64
    ;;
esac
`;

/** Write the fake `claude` into `<home>/bin`. Returns that directory. */
export function writeFakeClaude(home: string): string {
  const binDir = join(home, "bin");
  mkdirSync(binDir, { recursive: true });
  const stub = join(binDir, "claude");
  writeFileSync(stub, STUB);
  chmodSync(stub, 0o755);
  return binDir;
}
