### Orchestrator-Emit Gate (leading worktree)

This is the **first** phase. It runs before QUESTION, off the description
in `$ARGUMENTS` alone, because there is no predecessor artifact. It exists
so a `/team` run authors `docs/plans/<id>/` inside an isolated worktree on
branch `<id>` from phase 1. The home checkout's `git status` thus stays
clean for the whole run.

0. **Preflight the environment, then continue regardless.** Run these three
   read-only checks once and report what they say. **None of them blocks the
   run** — the pipeline never stops because a credential is cold.

   ```bash
   ssh-add -l >/dev/null 2>&1 && echo "ssh-agent: keys loaded" || echo "ssh-agent: UNREACHABLE"
   gh auth status >/dev/null 2>&1 && echo "gh auth: ok" || echo "gh auth: NOT LOGGED IN"
   echo "global commit.gpgsign: $(git config --global --get commit.gpgsign || echo unset)"
   T=$(mktemp -d); git -C "$T" init -q; timeout 20 git -C "$T" -c user.name=probe -c user.email=probe@example.com commit --allow-empty -q -m probe >/dev/null 2>&1 && echo "commit signing: ok" || echo "commit signing: FAILED OR HUNG"; rm -rf "$T"
   ```

   Each answer predicts a specific failure hours later, and knowing it up
   front is the difference between naming a cause and hunting one:

   - **An unreachable `ssh-agent`** breaks the push at the PR phase, and
     breaks any test that commits to a scratch repository while global
     `commit.gpgsign` is `true` — those inherit the setting, try to sign, and
     stall until they time out. A suite that normally runs in a minute takes
     ten and fails in places unrelated to the diff.
   - **A signing probe that fails or hangs** predicts every later commit —
     each slice commit and the ship commit — stalling on the signing
     agent, which the no-unsigned-commits rule turns into a hard stop.
     Twenty seconds here is cheaper than discovering it at the first
     slice commit.
   - **A missing `gh` login** breaks the PR phase only, at the very end,
     after all the work is done.

   Report the readings plainly and move on. When a later failure matches one
   of them, say so instead of diagnosing the symptom: a suite that fails only
   under the developer's own git config is an environment reading, not a
   regression in the branch, and reporting it as the latter sends someone
   after a bug that is not there.

1. **Create the home worktree** on branch `<id>` off `origin/HEAD`, with
   Claude Code's native worktree support. Call the Skill tool with
   `team-worktree` and follow the
   single-repo block under "Create the worktree(s)". Only the
   home repo gets a worktree at this phase. Multi-repo secondary worktrees
   are deferred until after the design review (see "Orchestrator-Emit Gate
   (post-design-review secondary worktrees)" below).
   **If the run was started from inside a linked worktree on a non-default branch, reuse it instead of creating a new one**
   (see "Detect existing worktree" in `skills/team-worktree/SKILL.md`). If
   that worktree is on the default branch, stop rather than implement on
   it.
2. **Create `docs/plans/<id>/` inside the worktree.** The artifact directory
   lives in the worktree from the start, so no copy is ever needed.
3. **Compute the worktree's absolute path once** and thread it into every
   downstream dispatch as the worktree-rooted `docs/plans/<id>/` path. The
   main session does NOT `cd` into the worktree. It passes absolute paths
   to each agent.
4. **Edge — branch `<id>` already exists** (re-invocation): if a worktree
   is already on branch `<id>`, reuse it. Do not recreate.
5. **Edge — home-worktree creation fails**, on a shallow clone, certain CI
   systems, or permissions. Report loudly and fall back to
   **in-place for the entire run**. Author `docs/plans/<id>/` at the
   home-repo root, and thread that root downstream as the absolute path.
   Never block the pipeline because worktree creation failed (mirror the
   best-effort fallback in `skills/worktree-isolation/SKILL.md` →
   "Fallback").
