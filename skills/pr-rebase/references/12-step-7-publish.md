### Step 7 — publish

Reached only with no regression and no unresolved escalation.

**Do not ask the user to confirm the publish.** The invocation carried the
authorization to rewrite the remote: model invocation is disabled, so only
a deliberate human started this run, and a confirmation here re-requests
permission that invocation granted — and every caller that chains into the
run inherits the stop. The guards on this irreversible push are mechanical,
not questions, and both have already run: explicit rebase intent scoped the
invocation, and the step 6 gate stopped the run on any regression. Once
step 6 reports no regression, publish.

**The no-evidence case publishes but never claims verification.** When
*every* configured check came back `UNKNOWN` — or the project configures no
checks at all — the comparison in step 6 had nothing to compare, so the run
has produced **zero evidence** that behavior was preserved. Publish on the
invocation's authority, and say exactly that in the completion: "no check
produced a usable baseline, so nothing verified that this rebase preserved
behavior." Never render this case as "checks match baseline"; they did not
match, they were absent. A repo with no checks is legitimate — the recovery
anchor (`git reset --hard <ORIG_SHA>`) is the safety net an unverified
publish leans on, so restate it with the completion.

**Capture the PR's draft state before anything publishes** — a publisher can
change it, and the re-check at the end of this step is how that is caught:

```sh
DRAFT_BEFORE="$(gh pr view ${PR:+"$PR"} --repo "$REPO" --json isDraft --jq .isDraft 2>/dev/null)"
```

**Plain git — the default publisher:**

```sh
git push --force-with-lease="${BRANCH:?}:${REMOTE_SHA_BEFORE:?}" --force-if-includes "${PUSH_REMOTE:?}" "${BRANCH:?}"
```

The explicit lease value is the remote tip captured in step 2, **before**
the step 3 fetch. That is the whole point: an implicit
`--force-with-lease` reads the remote-tracking ref, which our own fetch
already advanced, so it would authorize clobbering a push we fetched and
never integrated. `--force-if-includes` (git ≥ 2.30) additionally requires
that the remote tip be reachable from our reflog. Both, together, or no push
(Hard Rule 2). The target is `$PUSH_REMOTE` from step 0, never a hardcoded
`origin` — on a fork PR whose branch tracks a second remote, `origin` is the
upstream repository, and pushing there rewrites a branch the PR does not
track while leaving the PR itself unchanged.

- **The branch was never pushed** (`$REMOTE_SHA_BEFORE` is empty): no force
  is involved — `git push -u "${PUSH_REMOTE:?}" "${BRANCH:?}"`.
- **The push is rejected** (stale lease, branch protection): surface git's
  rejection **verbatim** and stop. Never retry with a bare `--force`. A
  stale lease means the remote moved during the run — re-run the skill from
  step 0 against the new remote state.

**A delegated publisher (`graphite`, `arc`, `sl`, or an instruction-named
command) takes no lease**, so take one for it: verify the remote tip is
still the sha captured in step 2, in the same invocation that publishes
(Hard Rule 10):

```sh
REMOTE_NOW="$(git ls-remote "${PUSH_REMOTE:?}" "refs/heads/${BRANCH:?}" | cut -f1)"
[ "$REMOTE_NOW" = "${REMOTE_SHA_BEFORE:?}" ] || { echo "refusing: remote moved during the run" >&2; exit 1; }
```

Then issue the publisher's own command — `gt submit`, `arc diff`,
`sl pr submit`, or whatever the instruction named — scoped to this branch
and the children step 4 restacked. Be plain in the report about what this
check is: it is check-then-act, and it races in a way git's atomic lease
does not — the remote can move between the `ls-remote` and the publish. It
is the best available guard when the push is not ours to issue, not an
equivalent one; never present it as if it were.

One Graphite wrinkle: `gt submit --stack` validates the whole repo, so it
can refuse because an *unrelated sibling* branch needs restacking. The
correct response is to scope the submit down to the current branch and its
restacked children — never to restack branches this run did not touch.

**Re-check the draft state after the publish, whichever path ran:**

```sh
DRAFT_AFTER="$(gh pr view ${PR:+"$PR"} --repo "$REPO" --json isDraft --jq .isDraft 2>/dev/null)"
```

Graphite's non-interactive mode announces that it creates PRs as drafts, and
a publisher that touches the PR can silently flip a ready-for-review PR back
to draft. When `$DRAFT_AFTER` differs from `$DRAFT_BEFORE`, say so loudly in
the completion and name the restore command (`gh pr ready --repo "$REPO"` to
mark it ready again; `gh pr ready --undo` for the reverse) — restoring it is
the user's call, not yours.

- The branch is replayed on `<BASE_REMOTE>/<base>` with every commit intact —
  none skipped, none emptied without saying so.
- Every conflict resolution is recorded in `docs/plans/<ID>/rebase-<n>.md`
  with both sides' intent and the reasoning.
- Every check that passed before the rebase passes after it.
- The remote tip was verified equal to `$REMOTE_SHA_BEFORE` at publish time —
  by git's lease or by the explicit `ls-remote` check — whichever publisher
  ran.
- The remote matches the local branch, or the run stopped before the publish
  with the reason and the recovery anchor stated.

- **`--ours` is the base, `--theirs` is your commit.** Backwards from a
  merge. Verify against `git show :2:` / `:3:` rather than trusting the flag
  names.
- **A commit that becomes empty** because the base already contains the same
  change is normal — `git rebase` drops it and says so. Confirm the change
  really is present on the base before accepting the drop; report every
  dropped commit in the completion.
- **A green suite after the rebase is not proof** when the baseline was
  `UNKNOWN`. Say so instead of implying verification happened.
- **Re-runs are safe.** An already-current branch stops at step 3 having
  changed nothing.
- **Long runs checkpoint.** The rebase log is append-only; a fresh context
  resumes from it rather than from replayed conversation.
- **`docs/plans/**` is never committed.** The log is local scratch, and
  `/pr-cleanup` removes the topic directory when the PR finishes.

Report, in a few lines: the branch, `<ORIG_SHA>` → the new head sha, the
base and which discovery tier resolved it, the resolved publisher and which
detection tier supplied it, how many commits were replayed and any that were
dropped as empty, the number of conflicts resolved (and how many were
escalated), any tracked children that were restacked, the baseline-vs-after
check table, whether the publish happened, and whether the PR's draft state
survived it. On any stop, state the reason and repeat
`Recovery: git reset --hard <ORIG_SHA>`. Name the rebase log path so the
resolutions can be read back.

The PR, if there is one, now shows the rebased tree and CI reruns against
it. This skill does not wait for that CI and does not merge — `/shipit`
lands the PR when the user decides to.
