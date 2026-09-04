## Input acquisition

`shipit` lands the open PR for the **current branch**. Discover it with
`gh pr view --json baseRefName,number,state,title` and a base-branch fallback.
Never hardcode the base branch. The `title` is captured here because step 4
lands it as the squash commit subject. Run this in one bash call (an agent
thread resets cwd between calls):

```bash
PR_JSON=$(gh pr view --json number,baseRefName,state,title 2>/dev/null)
BASE=$(printf '%s' "$PR_JSON" | jq -r .baseRefName 2>/dev/null)
[ -z "$BASE" ] || [ "$BASE" = "null" ] && BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
[ -z "$BASE" ] && BASE=main
echo "PR: $PR_JSON"
echo "BASE: $BASE"
```

- **No open PR for the current branch** (`gh pr view` finds none): **refuse with
  a clear message** and stop. `shipit` finalizes an existing PR — it does not
  open one. Tell the user to open the PR first.
- **PR state is `MERGED` or `CLOSED`** (read from the discovery JSON above):
  **refuse up front** with a clear message before doing any work — there is
  nothing to land.
- An optional `<pr-number>` argument overrides the discovered PR.
