### Step 0 — resolve the working context

Run in the invoking directory. This skill rebases *where you are*: a linked
worktree is a normal place to run it, and the commands are deliberately not
anchored to a primary clone.

```sh
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "refusing: not inside a git work tree" >&2; exit 1; }
BRANCH="$(git branch --show-current)"
[ -n "$BRANCH" ] || { echo "refusing: detached HEAD — check out the feature branch first" >&2; exit 1; }
REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null)"
```

An empty `$REPO` is tolerated (offline, or no GitHub remote): the run
degrades to a local rebase and stops before the push with that stated. Every
`gh` command that does run passes `--repo "$REPO"` rather than relying on
cwd detection.

**Resolve the two remotes separately. They are not always the same one, and
assuming `origin` for both silently pushes a fork PR's branch at upstream —
or at a same-named branch in the wrong repository.**

**Follow git's own push-remote precedence, in this exact order.** Anything
else computes a remote git itself would not push to, which desynchronizes
the lease from the push target:

```sh
PUSH_REMOTE="$(git config --get "branch.$BRANCH.pushRemote" \
  || git config --get remote.pushDefault \
  || git config --get "branch.$BRANCH.remote" \
  || echo origin)"
```

`branch.<name>.pushRemote` beats `remote.pushDefault`, which beats the
branch's fetch remote (`branch.<name>.remote`, what `@{upstream}` reports),
which falls back to `origin`. Reading `@{upstream}` *first* inverts the top
two: on a triangular setup — fetch from upstream, push to a fork — the
upstream ref names `origin`, so the force-push lands in the upstream
repository, which is the exact failure the two-remote split exists to
prevent. Deriving the remote from `git config` also avoids splitting
`@{upstream}`'s output on `/`, which is ambiguous for a slashed branch name.

**The base remote is resolved from the PR, not assumed to be `origin`.** On
a clone of your own fork, `origin` *is* the fork, and the fork's copy of the
base branch is stale by however long since it was last synced — rebasing
onto it replays your work on old history and produces a diff full of
changes you did not make:

```sh
# gh pr view exposes no baseRepository field; a PR lives in its base
# repository, so $REPO (step 0) already names the base owner/name.
BASE_OWNER="$REPO"
# Pick the remote whose URL names that repository.
BASE_REMOTE="$(git remote | while read -r r; do
  case "$(git remote get-url "$r")" in *"$BASE_OWNER"*) echo "$r"; break ;; esac
done)"
[ -n "$BASE_REMOTE" ] || BASE_REMOTE=origin
```

- **`$PUSH_REMOTE`** is where the rebased branch is force-pushed (step 7) and
  the remote whose tip the lease is taken against (step 2).
- **`$BASE_REMOTE`** is where the base branch is fetched from (step 3).
  When no PR resolved, it falls back to `origin` — say so in the report, and
  when the repo has more than one remote, name which one was used so a
  fork-clone user can catch a wrong pick before the rebase runs.
- **Whichever way it resolved**, confirm the base actually exists there
  (`git rev-parse --verify "refs/remotes/$BASE_REMOTE/$BASE"`) after the
  step 3 fetch, and refuse if it does not rather than rebasing onto a stale
  or missing ref.

**Cross-check the push target against the PR** whenever a PR resolved. The
PR's head is the authority on which repository the branch belongs to:

```sh
HEAD_OWNER="$(gh pr view ${PR:+"$PR"} --repo "$REPO" --json headRepositoryOwner --jq .headRepositoryOwner.login 2>/dev/null)"
PUSH_URL="$(git remote get-url "$PUSH_REMOTE" 2>/dev/null)"
```

If `$HEAD_OWNER` is non-empty and does not appear in `$PUSH_URL`, **stop**:
the branch's upstream is not the repository the PR reads from, so a
force-push would rewrite a branch the PR does not track and leave the PR
itself unchanged. Report both values and let the user point the branch at
the right remote.

**Resolve the publisher — the tool that owns pushing this branch.** The push
is not always the author's to issue: a Graphite-managed repo forbids
`git push` outright and requires `gt submit`, and Sapling, Gerrit, and
Phabricator own publishing the same way. Detection order, first match wins:

1. An explicit override — the user or the caller named the publish command.
2. A project or user instruction that forbids `git push` or names a required
   publish command. This tier is read from the instructions the session was
   loaded with, never from the filesystem — it is the constraint a repo's own
   rules supply, and the one that must win over any marker probe.
3. Repository markers, probed in one invocation:

   ```sh
   PUBLISHER=git
   ROOT="$(git rev-parse --show-toplevel)"
   if [ -f "$ROOT/.graphite_repo_config" ] \
      || { command -v gt >/dev/null 2>&1 && gt branch info "$BRANCH" >/dev/null 2>&1; }; then
     PUBLISHER=graphite
   elif [ -f "$ROOT/.arcconfig" ]; then
     PUBLISHER=arc
   elif command -v sl >/dev/null 2>&1 && sl root >/dev/null 2>&1; then
     PUBLISHER=sl
   fi
   ```

Report the resolved publisher — and which tier resolved it — in the
completion, the same way the base-discovery tier is reported. Every
publisher passes through the same step 7 gate; only the final command
differs.
