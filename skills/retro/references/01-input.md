## Input

`$ARGUMENTS` is optional: one **skill name** that narrows every lens to
learnings about that skill. Empty means the whole session.

**A focus is validated before anything is read.** Resolve it against the
directories that exist:

```sh
FOCUS="$ARGUMENTS"
LC_ALL=C                     # in a UTF-8 locale the bracket set is collation-dependent
case "$FOCUS" in
  '') : ;;                   # no focus — the whole session
  -*|*[!a-z0-9-]*)
    echo "refusing: a focus must be a skill name, lowercase and hyphenated" >&2; exit 1 ;;
  *)
    ls -1d -- "skills/$FOCUS" ".claude/skills/$FOCUS" 2>/dev/null
    ls -1 skills .claude/skills 2>/dev/null | sort -u ;;   # the candidate list
esac
```

The character allowlist runs before the lookup, not after: every skill
directory on disk is lowercase and hyphenated, so a name outside that set
cannot be a hit and must not reach a command as one.

A focus naming no skill **stops the run here** and prints its near matches —
the names within an edit or two of what was typed, and the names that contain
it. A focus that resolves is carried into every lens prompt as a scope, never
as a conclusion about what the session got wrong.
