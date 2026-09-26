#!/usr/bin/env bash
# Removes one recorded temp path, or refuses it.
# Exit 0: removed or already absent. Exit 1: refused. Exit 2: usage.

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
case "$TMPROOT" in /?*) ;; *) refuse "cannot be checked: temp root '${TMPDIR:-/tmp}' is not an absolute directory" ;; esac
while [ "${P%/}" != "$P" ]; do P="${P%/}"; done

case "$P" in "$TMPROOT"/?*) ;; *) refuse "is not under $TMPROOT" ;; esac
case "$P" in *..*) refuse "contains '..'" ;; esac
case "$P" in */./*|*/.|*//*) refuse "is not a canonical path" ;; esac
if [ -L "$P" ]; then refuse "is a symlink"; fi
if [ ! -e "$P" ]; then printf 'absent: %s\n' "$P"; exit 0; fi

# The root may itself be a symlink (macOS /var -> /private/var); no directory
# between the root and the path may be, or rm -rf lands outside the root.
REAL_ROOT="$(cd -P -- "$TMPROOT" && pwd -P)" || refuse "cannot be checked: temp root $TMPROOT does not resolve"
PARENT="${P%/*}"
REAL_PARENT="$(cd -P -- "$PARENT" && pwd -P)" || refuse "cannot be checked: its directory does not resolve"
if [ "$REAL_PARENT" != "$REAL_ROOT${PARENT#"$TMPROOT"}" ]; then
  refuse "is reached through a symlink"
fi

rm -rf -- "${P:?}"
printf 'removed: %s\n' "$P"
