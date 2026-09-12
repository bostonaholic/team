# Durable state

Pass durable work and gate results through self-declaring files. Consumers read the artifact path, not a producer's summary.
Write each required artifact before reporting completion. Rebuild interrupted work from authoritative files.
Overwrite revised designs only under their revision rule. Append verdict records without replacing earlier verdicts.
Checkpoint long procedures in append-only logs. Retain decisions, approvals, and pre-images in the artifact directory.

## Repeatable mutations

- Match existing titles or content before creation. Treat already-closed or already-deleted targets as done.
- Re-read each item immediately before writing. Compare with its captured pre-image. Skip and report drift instead of overwriting it.
- Record completed steps during execution. Serialize mutations with backoff when rate limits can leave partial work.
- Before destructive writes, capture the untouched baseline and a recovery anchor. No pre-image permits no destructive write.
- Run applicable checks before the operation. A baseline that could not run is UNKNOWN and proves no preservation.
- Cache bodies before composing replacements. Report rewrite recovery anchors on success and failure, including applicable `git reset --hard <sha>` recovery.

## Authoritative definitions

Name one owner for each rule, constant, and schema. Keep executable constants where they execute and cite that authority.
Pin necessary template or byte-identical copies with deterministic consistency checks and a comment naming the canonical definition.
When a summary disagrees with its source, use the source. Restate at most one line before citing longer guidance.
