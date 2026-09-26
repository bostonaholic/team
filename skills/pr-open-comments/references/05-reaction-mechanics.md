## Reaction mechanics

`addReaction` takes a GraphQL node id, so one mutation covers every
feedback shape — an inline review comment, a plain PR comment, and a review
submission body are all `Reactable`:

```bash
gh api graphql -f query='
mutation($subjectId: ID!, $content: ReactionContent!) {
  addReaction(input: {subjectId: $subjectId, content: $content}) {
    reaction { content }
  }
}' -f subjectId="<comment-node-id>" -f content=THUMBS_UP
```

Pass both variables with `-f`: `gh api -F` reads a leading `@` as a file
reference and coerces typed values. The content values are `THUMBS_UP`
and `THUMBS_DOWN`.

To capture what the mutation needs, select `id` and
`reactionGroups { content viewerHasReacted }` on the comment nodes in
the step 2 query. Skip any subject whose `viewerHasReacted` is already
true for the reaction you would add — a second run over the same PR must
not double-react.

A reaction failure is never fatal and never a exclusion. Warn, note it
on the item's report line, and carry on with the triage.
