## Verify the rendered body

The authority is the host's own renderer over the stored body — the same
component a reviewer sees. Reading the raw body back proves what was written,
not what renders.

Run this once per PR whose body this run wrote:

```bash
gh api repos/"$OWNER"/"$REPO"/pulls/"$NUMBER" \
  -H "Accept: application/vnd.github.full+json" --jq .body_html
```

### Assertions

Scope every assertion to the rendered Screenshots section: the span from its
rendered `<h2>` to the next `<h2>`, or to the end when none follows. Scoping is
what lets a hand-authored body embed its own diagram elsewhere without failing
this check.

1. **Every landed asset appears.** For each entry with a resolved URL, the
   section holds an image whose `alt` equals that entry's `screenshot-<NN>`.
2. **No local path survived.** No image inside the section has a `src` that
   starts `/`, starts `./`, or starts `file:`. The `src` host is deliberately
   not asserted, so a private-repository proxy rewrite cannot turn a good
   upload into a reported failure.
3. **A degraded write is checked as text.** When nothing landed and the
   degraded note was written, the note wording and each captured file's
   basename must appear in the section as text, and rule 2 still holds. The
   basename is what the body carries; the absolute path lives in `result.json`
   and never renders.

Nothing written means no read-back. Report what was left alone.

### The empty-`body_html` fallback

If the field ever comes back empty, render the stored body through the same
renderer and assert against that instead:

```bash
gh pr view "$NUMBER" --repo "$OWNER/$REPO" --json body \
  | jq --arg nwo "$OWNER/$REPO" '{text: .body, mode: "gfm", context: $nwo}' \
  | gh api --method POST /markdown --input -
```

`$OWNER/$REPO` is bound with jq's own `--arg`, never spliced into the program
string. `gh --jq` takes an expression and no arguments, which is why the pipe
goes through `jq` here: a closing-quote dance such as `"'"$OWNER/$REPO"'"`
makes the repository name part of the program source, so a name carrying a
quote rewrites the jq program rather than filling a slot in it
(`principle-never-interpolate`).

The `--input -` form is the one that works; `-f text=@-` posts the literal
`@-`.

### What a failure does

A failed read-back **never blocks, never retries, and never reverts the body.**
It sets `outcome` to `unverified`, nulls `section` so nothing propagates to any
other PR, and reports loudly with the assertion that failed. Fail-closed binds
the *claim* this run makes, not the write it already landed. There is no wait
loop here and no second body write of any kind.
