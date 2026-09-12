### 6. Stop conditions

`pr-watch-mechanics` owns three: user interrupt, the 3-cycle soft cap, and
3 consecutive poll failures. This skill adds three, each reported by name:

- **Approval** — run the hand-off in step 7.
- **Merge or close** — the PR reached a terminal state. Report it.
- **Third-party participant** — fires on an unresolved thread carrying
  both a comment from the viewer and a comment from a third-party
  login. It names the login(s), or "comment author unavailable" for a
  null author. No triage call, reply, or resolve fires that cycle.
