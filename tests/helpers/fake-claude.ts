// tests/helpers/fake-claude.ts
//
// A stand-in for the `claude` binary, for the Claude Code dev-install tests.
// It models the parts of `claude plugin` that script/dev-install-claude drives:
// marketplace registration, install/update, and the JSON listings the script
// reads back. State lives under $HOME, so every test isolates with
// HOME=<tempdir>, and each invocation is appended to $HOME/state/calls.
//
// Extracted from tests/regression-309-idempotent-install.test.ts unchanged when
// tests/dev-install-claude.test.ts became a second consumer.

import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STUB = `#!/usr/bin/env bash
set -euo pipefail

STATE="$HOME/state"
mkdir -p "$STATE"
printf '%s\\n' "$*" >> "$STATE/calls"

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
    ;;
  "plugin marketplace update")
    ;;
  "plugin install team@team-dev")
    if [ -f "$STATE/installed-version" ]; then
      echo "Plugin 'team@team-dev' is already installed" >&2
      exit 1
    fi
    printf '%s' "$PLUGIN_VERSION" > "$STATE/installed-version"
    mkdir -p "$HOME/.claude/plugins/cache/team-dev/team/$PLUGIN_VERSION"
    ;;
  "plugin update team@team-dev")
    printf '%s' "$PLUGIN_VERSION" > "$STATE/installed-version"
    mkdir -p "$HOME/.claude/plugins/cache/team-dev/team/$PLUGIN_VERSION"
    ;;
  "plugin list --json")
    if [ -f "$STATE/installed-version" ]; then
      version=$(<"$STATE/installed-version")
      printf '[{"id":"team@team-dev","version":"%s","scope":"user","installPath":"%s/.claude/plugins/cache/team-dev/team/%s"}]\\n' "$version" "$HOME" "$version"
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
