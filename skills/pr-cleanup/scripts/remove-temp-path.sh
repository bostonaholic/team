#!/usr/bin/env bash
# Removes one recorded temp path, or refuses it.
# Exit 0: removed or already absent. Exit 1: refused, deleted nothing.
# Exit 2: usage. Exit 3: rm failed, so the path may be partly removed.

set -euo pipefail

if [ "$#" -ne 1 ]; then
  printf 'usage: %s <recorded-temp-path>\n' "$0" >&2
  exit 2
fi

P="$1"
refuse() { printf "refusing: '%s' %s\n" "$P" "$1" >&2; exit 1; }

# macOS TMPDIR ends in /, and an unstripped root would refuse every path.
TMPROOT="${TMPDIR:-/tmp}"
while [ "${TMPROOT%/}" != "$TMPROOT" ]; do TMPROOT="${TMPROOT%/}"; done
case "$TMPROOT" in /?*) ;; *) refuse "cannot be checked: temp root '${TMPDIR:-/tmp}' is empty or not absolute once trailing slashes are stripped" ;; esac
# Callers' mktemp under a /-terminated TMPDIR records "T//name"; collapse it.
while case "$P" in *//*) true ;; *) false ;; esac; do P="${P%%//*}/${P#*//}"; done
while [ "${P%/}" != "$P" ]; do P="${P%/}"; done

case "$P" in "$TMPROOT"/?*) ;; *) refuse "is not under $TMPROOT" ;; esac
case "$P" in *..*) refuse "contains '..'" ;; esac
case "$P" in */./*|*/.) refuse "is not a canonical path" ;; esac

# The root may itself be a symlink (macOS /var -> /private/var); no directory
# between the root and the path may be, or rm -rf lands outside the root.
# /bin/pwd reads the real cwd (getcwd); bash's pwd re-resolves the path string.
REAL_ROOT="$(cd -P -- "$TMPROOT" && /bin/pwd -P)" || refuse "cannot be checked: temp root $TMPROOT does not resolve"
PARENT="${P%/*}"
# Check and delete from inside the verified directory: a symlink swapped in above
# it after the check cannot redirect rm, and rm does not follow the final component.
cd -P -- "$PARENT" || refuse "cannot be checked: its directory does not resolve"
if [ "$(/bin/pwd -P)" != "$REAL_ROOT${PARENT#"$TMPROOT"}" ]; then
  refuse "is reached through a symlink"
fi
NAME="./${P##*/}"
if [ -L "$NAME" ]; then refuse "is a symlink"; fi
if [ ! -e "$NAME" ]; then printf 'absent: %s\n' "$P"; exit 0; fi

rm -rf -- "$NAME" || { printf "failed: '%s' was not fully removed\n" "$P" >&2; exit 3; }
printf 'removed: %s\n' "$P"
