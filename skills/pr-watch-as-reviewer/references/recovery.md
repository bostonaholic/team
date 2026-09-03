# Reviewer-watch recovery

Load only after compaction or partial failure.

- Re-query canonical PR state, viewer, threads, comments, current head, and
  native auto-merge.
- Arm-time head, auto-merge confirmation, and tracked-comment IDs must come
  from printed arm/snapshot records, never the current value.
- Viewer rebuttals are recoverable from GitHub; do not answer the same author
  reply twice.
- Re-review any verdict missing from surviving snapshots.
- If self-resolve attribution is lost, disclose that in the approval body
  instead of guessing `<R>`.
- If tracked counts are lost, disclose that comparison is unavailable.
- If the arm-time tracked-comment list is lost, stop and require re-arm.
