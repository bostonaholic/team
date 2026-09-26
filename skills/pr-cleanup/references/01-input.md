## Input

`$ARGUMENTS` is a PR number (digits only) or full PR URL — resolve its head
branch via `gh` — or a branch name. With nothing, default to the branch
checked out in the invoking directory (step 0 captures it as
`$INVOKE_BRANCH` before commands are anchored to the primary clone).

Refusals, before anything else runs:

- **The PR is open and should stay open.** Cleanup is for finished work;
  tell the user to merge or close first.
- **Malformed input.** A PR number that is not digits-only, or a URL that
  does not parse, is reported — never guessed at. Gate every `$NUMBER`
  mechanically before it reaches a `gh` command, and terminate the
  consuming `gh` invocation with `--` before the number:

  ```sh
  case "$NUMBER" in
    ''|*[!0-9]*) echo "refusing: PR number must be digits only — re-run with the PR's numeric ID or its full URL" >&2; exit 1 ;;
  esac
  ```

- **Invalid branch names.** Every externally sourced branch name — a PR's
  `headRefName`, a stack-chain entry, a user argument — must pass a
  character allowlist before it reaches any command: only
  `^[A-Za-z0-9._/-]+$`, with no leading `-` and no `..`. Set `LC_ALL=C` in
  the same invocation: in a UTF-8 locale the bracket expression accepts
  multibyte characters. Refuse otherwise — report the offending name and
  tell the user to handle that branch manually; never normalize or
  re-quote a name to make it pass:

  ```sh
  LC_ALL=C
  case "$BRANCH" in
    ''|-*|*..*|*[!A-Za-z0-9._/-]*)
      echo "refusing: unsafe branch name — clean it up manually" >&2; exit 1 ;;
  esac
  ```

  Then run `git check-ref-format --branch "$BRANCH"` as a ref-syntax check,
  not a shell control; only the allowlist makes a name safe in a command.
