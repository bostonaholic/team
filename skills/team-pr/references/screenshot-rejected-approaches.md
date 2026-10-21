## Rejected approaches

Read this before improvising an upload route.

1. **Rejected: commit the images to an orphan branch and link the blob URL** (`https://github.com/<owner>/<repo>/blob/<sha>/<file>?raw=1`). Branch cleanup leaves a merged PR with dead references, and on a private repository the URL needs a web session, so no token or sessionless fetch proves a reviewer sees the image.
2. **Rejected: a headless browser on a persistent signed-in profile** driving github.com's markdown textarea. It adds a second unencrypted credential store and a manual sign-in no autonomous run can perform. Nothing here reads, migrates, or removes an old profile directory; to revoke one, sign out of github.com inside it or delete the directory.
3. **Rejected: detect a concurrent append by comparing the body's tail** instead of the prefix guard. The window stays open, and any host-side tail variation halts a correct run.
