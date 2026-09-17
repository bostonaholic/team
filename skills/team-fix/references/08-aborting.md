Before invocation or continuation, read [skill dispatch](../team/references/skill-dispatch.md); apply its installation-aware continuation and self-resume rules.

## Aborting

If reproduction fails: report "Bug could not be reproduced with the
given description." and stop. Do not write a test for an unconfirmed bug.

If the fix is larger than expected (touching many files, requiring new
APIs, or revealing an architectural problem): stop, report the scope,
and recommend switching to the full `team` through the continuation choices pipeline.
