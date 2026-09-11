# Migration contract: M01

M01 records Team's behavior before later milestones move runtime instructions.
Use the [verification commands](verification/README.md) and [revision-bound observations](verification/migration-baseline.md) to compare later changes.

- Keep runtime routing, authorization, permissions, artifact schemas, registrations, and agent preloads unchanged.
- Keep current catalog, context, and evaluation-selection budgets and mappings unchanged.
- Preserve the [frozen Golden Master prompt](../golden-master/prompt.md), its pinned digest, and Linkboard's `golden-master-baseline` at `2cfee1a`.
- Preserve the [initial inventory](verification/baselines/m01.json). Explain later name or count differences against its revision.
- Treat 91 skills as the measured starting catalog. Document current-main drift without forcing a reduction.
- Reuse existing harness commands. Add no general verification runner or runtime migration.

Source inventory measures declarations and file content. It does not measure model context or native-host loading.
Fake-host installer tests measure copied resource bytes. Live-host instruction use needs separate observations.
Supplied continuous integration (CI) attempts remain historical observations, with each failure and retry separate.
Unavailable local paid evaluations, unavailable live-host checks, and unavailable full Golden Master runs remain explicit gaps.
Prepared application checkouts and application tests establish only benchmark preparation.

Slice 1 records inventory and existing checks. Later M01 slices own installed-resource cases, recovery characterization, and runbook protocol alignment.
[The test strategy](testing.md) defines the applicable evidence layers.
Confidence: high for this scope, from [milestone #369](https://github.com/bostonaholic/team/issues/369).
