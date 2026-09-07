## Rejected approaches

Read this before improvising an upload route. Each option below looks workable
and has a recorded reason it is not.

1. **Rejected: commit the images to an orphan branch and link the blob URL.**
   Push the PNGs to a throwaway branch, then reference
   `https://github.com/<owner>/<repo>/blob/<sha>/<file>?raw=1` from the PR
   body. *Why rejected:* two independent reasons, and each is sufficient.
   First, the images are deleted with the branch — every routine branch
   cleanup, including this project's own teardown, silently empties the PR of
   its screenshots, and a merged PR keeps the dead references forever. Second,
   on a private repository that URL is a **web-session** URL: a
   token-authenticated fetch of it returns 404 while a signed-in reviewer sees
   the image, and a fetch by a reader with no session returns 404 whether the
   blob exists or not. So "the blob exists" is never evidence the image
   renders, and neither is a successful raw fetch evidence a reviewer can see
   it. Verification through that URL cannot distinguish the two failures it
   would exist to tell apart.

2. **Rejected: a headless browser on a persistent signed-in profile.**
   Drive github.com's own markdown textarea with a browser launched against a
   long-lived profile directory, and read the resolved URL out of the textarea.
   *Why rejected:* it costs a second unencrypted credential store on every
   operator machine, a manual one-time sign-in that no autonomous run can
   perform, an uninstalled browser-automation dependency, and a whole degraded
   branch for the expired-session case. The attach flag on the existing,
   already-authenticated CLI does the same job under one identity. Operator
   machines may still carry that profile directory from the earlier procedure;
   nothing here reads it, migrates it, or removes it. To revoke it, sign out of
   github.com inside that profile or delete the directory.

3. **Rejected: detect a concurrent append by comparing the body's tail.**
   Instead of the prefix guard, compare the post-attach trailing region against
   the exact tail the attach step expects to have added, and treat any
   difference as a concurrent write. *Why rejected:* it narrows the accepted
   loss without closing the window, and it buys that narrowing with false
   positives this skill cannot afford. The write still follows the read, so a
   writer landing between the comparison and the write is undetectable either
   way; meanwhile the expected tail is exactly the text whose form is least
   pinned here, so any host-side variation in it reads as a concurrency error
   and halts a run that was correct. The prefix guard is scoped to what it can
   actually prove. Closing the window for real needs a lock the host does not
   offer, which is why *prevention* is out of reach rather than merely
   unimplemented.
