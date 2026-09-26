#!/usr/bin/env bash
# Removes one recorded temp path, or refuses it.
# Exit 0: removed or already absent. Exit 1: refused, deleted nothing.
# Exit 2: usage. Exit 3: rm failed, so the path may be partly removed.
# Needs an external pwd at /bin/pwd or /usr/bin/pwd; without one it refuses.

set -euo pipefail

if [ "$#" -ne 1 ]; then
  printf 'usage: %s <recorded-temp-path>\n' "$0" >&2
  exit 2
fi

P="$1"
refuse() { printf "refusing: '%s' %s\n" "$P" "$1" >&2; exit 1; }

# macOS TMPDIR ends in /, and an unstripped root would refuse every path.
TMPROOT="${TMPDIR:-/tmp}"
while case "$TMPROOT" in *//*) true ;; *) false ;; esac; do TMPROOT="${TMPROOT%%//*}/${TMPROOT#*//}"; done
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
# An external pwd reads the real cwd (getcwd); bash's re-resolves the path string.
# Fixed locations, never PATH, so a shim cannot answer the check.
PWD_BIN=
for c in /bin/pwd /usr/bin/pwd; do
  if [ -f "$c" ] && [ -x "$c" ]; then PWD_BIN="$c"; break; fi
done
[ -n "$PWD_BIN" ] || refuse "cannot be checked: no external pwd at /bin/pwd or /usr/bin/pwd"
# The x sentinel keeps the trailing newlines $( ) would strip from a directory name.
REAL_ROOT="$(cd -P -- "$TMPROOT" && "$PWD_BIN" -P && echo x)" || refuse "cannot be checked: temp root $TMPROOT does not resolve"
REAL_ROOT="${REAL_ROOT%$'\n'x}"
PARENT="${P%/*}"
# Check and delete from inside the verified directory: a symlink swapped in above
# it after the check cannot redirect rm, and rm does not follow the final component.
cd -P -- "$PARENT" || refuse "cannot be checked: its directory does not resolve"
CWD="$("$PWD_BIN" -P && echo x)" || refuse "cannot be checked: its directory does not resolve"
if [ "${CWD%$'\n'x}" != "$REAL_ROOT${PARENT#"$TMPROOT"}" ]; then
  refuse "is reached through a symlink"
fi
NAME="./${P##*/}"
if [ -L "$NAME" ]; then refuse "is a symlink"; fi
if [ ! -e "$NAME" ]; then printf 'absent: %s\n' "$P"; exit 0; fi

rm -rf -- "$NAME" || { printf "failed: '%s' was not fully removed\n" "$P" >&2; exit 3; }
printf 'removed: %s\n' "$P"
