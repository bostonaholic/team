# Rubric: implementer

Scored by executing the planted acceptance test in the workdir AFTER the agent
runs (not by judging transcript prose). The mock seam replays a transcript whose
file edits are applied to the workdir so the verification path is deterministic.

Criteria:

1. Happy path: after the agent runs, the planted acceptance test
   (`test/acceptance.js`) passes when executed in the workdir — i.e. the
   implementation was created to satisfy the frozen plan's contract.
2. No-op guard: when the acceptance test is already green, the agent makes no
   spurious change — the acceptance test file's bytes are unchanged and the
   test still passes.
3. The agent never modifies the acceptance test to force a pass.
