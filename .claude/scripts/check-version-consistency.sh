#!/usr/bin/env bash
#
# check-version-consistency.sh — land-time consistency assertion for the
# version-bump skill (docs/versioning.md).
#
# The version string lives in six places across five files. All six must be
# strict semver and agree; the host manifests must agree on the plugin name,
# the marketplace name, and the description. Exit 0 = consistent, 1 = drift
# (each drift printed). Requires: jq.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 1

ERRORS=0
fail() { ERRORS=$((ERRORS + 1)); printf 'FAIL %s\n' "$1" >&2; }
q() { jq -r "$2" "$1" 2>/dev/null; }

CLAUDE_PLUGIN='.claude-plugin/plugin.json'
CLAUDE_MARKET='.claude-plugin/marketplace.json'
CODEX_PLUGIN='.codex-plugin/plugin.json'
CODEX_MARKET='.agents/plugins/marketplace.json'
ROOT_PLUGIN='plugin.json'
PKG='package.json'

for f in "$CLAUDE_PLUGIN" "$CLAUDE_MARKET" "$CODEX_PLUGIN" "$CODEX_MARKET" "$ROOT_PLUGIN" "$PKG"; do
  jq -e . "$f" >/dev/null 2>&1 || fail "$f is missing or not valid JSON"
done

version=$(q "$CLAUDE_PLUGIN" .version)
grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' <<<"$version" \
  || fail "$CLAUDE_PLUGIN version is not 3-part semver: '$version'"

check_version() { # <file> <jq path>
  local v; v=$(q "$1" "$2")
  [ "$v" = "$version" ] || fail "$1 $2 is '$v', expected '$version'"
}
check_version "$CLAUDE_MARKET" .metadata.version
check_version "$CLAUDE_MARKET" '.plugins[0].version'
check_version "$CODEX_PLUGIN" .version
check_version "$ROOT_PLUGIN" .version
check_version "$PKG" .version

name=$(q "$CLAUDE_PLUGIN" .name)
[ "$(q "$CODEX_PLUGIN" .name)" = "$name" ] || fail "$CODEX_PLUGIN name differs from $CLAUDE_PLUGIN"
[ "$(q "$CLAUDE_MARKET" '.plugins[0].name')" = "$name" ] || fail "$CLAUDE_MARKET plugins[0].name differs from $CLAUDE_PLUGIN"
[ "$(q "$CODEX_MARKET" '.plugins[0].name')" = "$name" ] || fail "$CODEX_MARKET plugins[0].name differs from $CLAUDE_PLUGIN"
[ "$(q "$CODEX_MARKET" .name)" = "$(q "$CLAUDE_MARKET" .name)" ] || fail "marketplace name differs between $CODEX_MARKET and $CLAUDE_MARKET"

description=$(q "$CLAUDE_PLUGIN" .description)
[ -n "$description" ] || fail "$CLAUDE_PLUGIN description is empty"
check_description() { # <file> <jq path>
  [ "$(q "$1" "$2")" = "$description" ] || fail "$1 $2 description differs from $CLAUDE_PLUGIN"
}
check_description "$CLAUDE_MARKET" .metadata.description
check_description "$CLAUDE_MARKET" '.plugins[0].description'
check_description "$CODEX_PLUGIN" .description
check_description "$CODEX_MARKET" '.plugins[0].description'
check_description "$PKG" .description

if [ "$ERRORS" -gt 0 ]; then
  printf '%d inconsistency(ies) found\n' "$ERRORS" >&2
  exit 1
fi
printf 'OK: six version strings agree on %s; host manifests agree on names and description\n' "$version"
