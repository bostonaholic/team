## Screenshot Upload

Screenshots render inline for any reviewer, private repos included, through
GitHub's user-attachments pipeline. Run this procedure only when the
manifest carries `## Captured` entries whose PNGs exist on disk. In every
other case the rendering rules above already produced the final section
(absent, or note-only) and there is nothing to upload. Sequencing is
PR-first — three explicit steps, mirroring the Companion-PRs open-then-edit
shape:

1. **The draft PR already exists**, opened in Execution step 7. Its initial
   body carries whatever the rendering rules above produced. When this
   procedure runs, that is the "not yet uploaded" local-path form of the
   `## Screenshots` section.
2. **Upload.** Session pre-check first — Chromium writes its cookie store
   in either of two layouts, so tolerate both:
   `P="${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile"; [ -f "$P/Default/Cookies" ] || [ -f "$P/Default/Network/Cookies" ]`.
   If the check fails, no authenticated browser session exists → skip the
   upload entirely, keep the degraded note, and append the one-time sign-in
   instruction to the **operator-facing completion report** — never to the PR
   body, which keeps only the degraded note and local paths. The instruction
   (keep it in sync with the README's "Screenshots in PRs" section):

   ```sh
   mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile"
   chmod 700 "${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile"
   npx playwright codegen \
     --user-data-dir="${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile" \
     https://github.com
   ```

   Sign in to github.com once in that headed window, then close it. The
   sign-in itself stays manual. That profile holds a full **unencrypted**
   github.com web session. To revoke it, sign out of github.com inside that
   profile or delete the directory. If the pre-check passes, `chmod 700`
   the profile directory before use (idempotent — never rely on
   documentation alone), then run a short Node script through Bash:
   `chromium.launchPersistentContext` on the profile directory, headless.
   Open the PR page. Confirm the signed-in marker (the `user-login` meta
   tag is present, no redirect to `/login`) — logged out despite the cookie
   file means an expired session → the same degraded path. For each
   manifest entry with an existing PNG under 10MB, set the file on the
   markdown textarea's file input, wait for GitHub's user-attachments
   pipeline to insert the
   `https://github.com/user-attachments/assets/<uuid>` URL into the
   textarea, record it, then clear the textarea before the next image so
   each URL is unambiguously attributed to its manifest entry. 60s bound
   per image (timeout → that image is a failure). Oversize files (>10MB)
   are skipped at upload and noted. Pass file paths and captions to the
   script as argv (or environment variables), never interpolated into a
   command string. Do not submit any comment — the textarea is only the
   upload vehicle.
3. **Body edit.** `gh pr edit --body` replaces the `## Screenshots` section
   wholesale — succeeded images render as `**<caption>** (<state>)` +
   `![<caption>](<url>)`. Failures are listed by caption + local path in
   the same section (partial success → embed the succeeded URLs, list the
   rest as failures). Re-running team-pr for the same id replaces the
   section wholesale again. Previously uploaded URLs remain valid.

**Multi-repo:** upload once, on the home-repo PR. Companion-PR bodies embed
the same URLs — never re-upload per repo.

**Failure posture:** every branch ends with an open PR, a visible note, and
local paths. Upload problems never block the PR, retry-loop, or prompt the
user — the upload is an enhancement per
`principle-optimization-never-dependency`, and its absence
costs nothing but the note.
