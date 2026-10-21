#!/bin/sh
#
# Read-only environment probes run once before the leading WORKTREE phase.
# No reading blocks the run; the caller reports them and moves on.
#
#   usage: preflight.sh
#
# Prints exactly four lines to stdout, in this order:
#
#   ssh-agent: keys loaded | ssh-agent: UNREACHABLE
#   gh auth: ok | gh auth: NOT LOGGED IN
#   global commit.gpgsign: <value> | global commit.gpgsign: unset
#   commit signing: ok | commit signing: FAILED OR HUNG
#
# The signing probe makes an empty commit in a throwaway repository under the
# caller's global git config, and is killed after TEAM_PREFLIGHT_SIGN_TIMEOUT
# seconds (default 20).
#
# Exit codes:
#
#   0  all four readings printed, whatever they say
#   1  git is not installed
#   2  usage error (any argument)

set -u

# Long enough for a hardware-key or agent prompt, short enough not to stall setup.
SIGN_TIMEOUT="${TEAM_PREFLIGHT_SIGN_TIMEOUT:-20}"

if [ "$#" -gt 0 ]; then
  printf 'preflight.sh: takes no arguments\nusage: preflight.sh\n' >&2
  exit 2
fi
if ! command -v git >/dev/null 2>&1; then
  printf 'preflight.sh: git is not installed\n' >&2
  exit 1
fi

if ssh-add -l >/dev/null 2>&1; then
  echo "ssh-agent: keys loaded"
else
  echo "ssh-agent: UNREACHABLE"
fi

if gh auth status >/dev/null 2>&1; then
  echo "gh auth: ok"
else
  echo "gh auth: NOT LOGGED IN"
fi

echo "global commit.gpgsign: $(git config --global --get commit.gpgsign || echo unset)"

# Portable timeout: macOS ships no `timeout`, so a watcher kills the probe.
probe_dir="$(mktemp -d)"
trap 'rm -rf "$probe_dir"' EXIT
git -C "$probe_dir" init -q >/dev/null 2>&1
git -C "$probe_dir" -c user.name=probe -c user.email=probe@example.com \
  commit --allow-empty -q -m probe </dev/null >/dev/null 2>&1 &
probe_pid=$!
( sleep "$SIGN_TIMEOUT"; kill "$probe_pid" 2>/dev/null ) >/dev/null 2>&1 &
watcher_pid=$!
if wait "$probe_pid"; then
  echo "commit signing: ok"
else
  echo "commit signing: FAILED OR HUNG"
fi
kill "$watcher_pid" 2>/dev/null
wait "$watcher_pid" 2>/dev/null
exit 0
