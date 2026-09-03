# GitHub execution recipes

Load only after the relevant mutation class has approval.

Create or update a milestone with JSON written by `jq`, never interpolated
prose:

```bash
jq -n --arg title "$MILESTONE_TITLE" --arg description "$DESCRIPTION" \
  --arg due_on "$DUE_ON" \
  '{title: $title, description: $description, due_on: $due_on}' \
  > "$RUN_DIR/milestone-new.json"
gh api "repos/$OWNER/$REPO/milestones" --method POST \
  --input "$RUN_DIR/milestone-new.json"
```

Attach and rewrite with a pre-image:

```bash
MILESTONE_TITLE="$(jq -r --argjson m "$M" \
  '.[] | select(.number == $m) | .title' "$RUN_DIR/milestones.json")"
gh issue edit "$N" --repo "$OWNER/$REPO" --milestone "$MILESTONE_TITLE"
gh issue view "$N" --repo "$OWNER/$REPO" --json body --jq .body \
  > "$RUN_DIR/original-body-$N.md"
gh issue edit "$N" --repo "$OWNER/$REPO" \
  --body-file "$RUN_DIR/body-$N.md"
```

Post approved comments by file and add labels without replacement:

```bash
gh api --method POST "repos/$OWNER/$REPO/issues/$N/comments" \
  -F body=@"$RUN_DIR/comment-$N.md"
gh issue edit "$N" --repo "$OWNER/$REPO" --add-label enhancement
```

For Projects v2, resolve project, item, field, and option IDs, then:

```bash
gh api graphql -f query='mutation($project: ID!, $item: ID!, $field: ID!,
  $option: String!) { updateProjectV2ItemFieldValue(input: { projectId: $project,
  itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } })
  { projectV2Item { id } } }' \
  -f project="$PROJECT_ID" -f item="$ITEM_ID" -f field="$FIELD_ID" \
  -f option="$OPTION_ID"
```

Re-read after every write. Match existing milestones and issues before create
so reruns converge instead of duplicating.
