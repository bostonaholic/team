## File the backlog items

A demoted finding is durable only once it lands somewhere a person will see it
again. So each Backlog item becomes an issue on **whatever tracker this repo
already names** — never a tracker this skill picked, and never a local file a
tool outside the plugin would have to read.

### Resolve the tracker, in this order

1. **The repo's own router.** `AGENTS.md`, `CLAUDE.md`, or the instructions
   this session loaded name the tracker and the board, and that answer wins.
   Probing a command first would fix every repo to GitHub issues even where its
   router names Linear, Jira, or a project board with its own field rules.
2. **An authenticated `gh` with issues enabled**, when the router named no
   tracker: `gh auth status` succeeds and
   `gh repo view --repo <owner/repo> --json hasIssuesEnabled` reports true.
3. **print-only**, when neither resolved. The items print verbatim and the
   summary marks them unfiled.

Resolve the repository explicitly, in the same invocation that files the issue —
shell state does not survive between invocations, and an irreversible command
must never read a variable an earlier block set:

**Every prose value travels by file.** The body already does; the title does
too, because it is a paraphrase of transcript text and this is the run's one
irreversible public write:

```sh
REPO="$(git remote get-url origin | sed -e 's#.*[:/]\([^/]*/[^/]*\)$#\1#' -e 's#\.git$##')"
TITLE="$(cat "<run cache>/title-<n>.txt")"
gh issue create --repo "${REPO:?}" --title "${TITLE:?}" \
  --body-file "<run cache>/issue-<n>.md"
```

Write the title with the file-writing tool alongside the body. A title pasted
between double quotes runs its own `$(…)`, backticks, and `${…}` as shell
before `gh` starts; a command substitution's output is not re-parsed, so the
title reaches the command only as an expanded variable.

A bare `gh` reads the current directory's remote, and a set `GH_REPO` answers
from anywhere — so in a worktree, a submodule, or a multi-repo checkout the
issue can land in a repository nobody named. Every `gh issue` call therefore
carries `--repo` explicitly, and `${REPO:?}` and `${TITLE:?}` abort rather than
expanding to empty if either came back blank.

### One question per issue

Creation is public and irreversible, so the granularity is **one question per
issue**, not one for the class: fire a separate `AskUserQuestion` per proposed
issue, each presenting the exact title and body it would create. Approving one
issue never creates another, and approving the skill-edit class never creates
any. The granularity rule is `principle-explicit-intent`: one
yes per irreversible mutation.

Each body paraphrases — it carries the learning, the file path or turn index
behind it, and the layer the check would live at. It never quotes a transcript
line into a public tracker.

### The fields the router states

Where the router states field rules, obey them; where it states none, the issue
carries title and body only. In this repo `docs/project-tracking.md` states
them: add the issue to the project board, set a `Priority`, and set `P0` on
anything labelled `bug`. An issue filed without the fields its router requires
is untriaged the moment it lands, which is the failure this tier exists to
prevent.

### When filing fails

An unauthenticated tracker, a repository with issues disabled, or a failed
`gh issue create` does not stop the run: print the remaining item bodies
verbatim so nothing is lost, and mark them **unfiled** in the summary. A
backlog that silently failed to become durable is the one outcome worth being
loud about.

Report, in a few lines: the run cache path, the resolved transcript path, the
counts step 2 printed, whether the lenses ran fanned out or inline in
reduced-assurance mode, every disqualified lens reply with the pass that
replaced it and any pass left unrun, the three lists with one line of evidence
each, the plan file's absolute path, then — once the apply turn has run — each
edit applied with its recovery command, each skill created, each item skipped
with one line of reason, the check verdict, and the backlog split two ways:
every item **filed** with its issue URL, and every item left **unfiled** with
the reason it could not be.

Before that approval, nothing outside the run cache has been written.
