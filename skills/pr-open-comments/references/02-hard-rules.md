## Hard Rules

These rules govern every run. The auto-apply bar and explicit user
authorization change who triggers Authorized Execution — they never
weaken a rule below.

1. **Verification precedes confidence.** Rate confidence in a
   recommendation only after step 4 assigns the verdict. A verdict other
   than `STILL RELEVANT` can never reach the auto-apply bar. A behavioral
   claim exceeds 90% only when verification produced a named reproduction
   test that fails before the fix and passes after the fix is applied —
   run the passing check before any push.
   The general rule: `principle-evidence-over-assertion` —
   no verdict without cited evidence.
2. **The auto-apply bar is 90%.** In default mode, an item that rates
   above 90% confidence, hits no exclusion, and stays inside the anchored
   file and lines gets the full treatment automatically: apply, push,
   SHA-cited reply, resolve. No user authorization is needed. No user
   authorization is needed for these items.
3. **Exclusions are absolute.** Confidence never overrides a exclusion.
   The exclusions are a security-sensitive construct, a
   broader-than-anchor ask, declined, needs-clarification,
   could-not-apply, a push failure, and any untrusted-input rule. An item
   that hits one is presented, never auto-applied, at any confidence.
4. **Present, then stop for everything else.** Every item that does not
   clear the auto-apply bar goes on the punch list, and what step 4 may
   do for such an item is a **closed list of two**. **One:** the
   usefulness reaction — it carries no ask, resolves nothing, and every
   reviewer earns that signal whether or not their comment led to a
   change. **Two:** a throwaway verification test written in step 4 to
   prove a comment's claim — never stage or commit it, and
   delete it before step 6 (auto-apply) runs; under the red-green proof,
   delete it after the passing run and before the commit itself, so an
   autonomous commit can never contain a reproduction test. Nothing else:
   no edit to any other file, no reply, no resolution. After you
   render the punch list, end the turn and wait for the user to pick
   actions. Each chosen action runs in a separate, follow-up turn.
   Rules 2–4 are `principle-plan-present-wait` applied per
   item: above a verified bar and inside every hard rule an item may skip
   the wait; everything else is presented, never auto-applied.
