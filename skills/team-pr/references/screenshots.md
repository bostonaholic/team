# Screenshot rendering and upload

Use this procedure only when `screenshots/manifest.md` exists or a push changes
the UI. Call the Skill tool with `verifying-ux` before recapture.

## Render

- No manifest: omit `## Screenshots`.
- Malformed or `skipped-*`: render one line naming the failure; continue.
- Captured file present: render `**<caption>** (<state>)` and its local path.
- Missing file: skip it and name the discrepancy.
- `partial`: add `N states skipped — see manifest`.
- Before/without upload: retain paths plus `captured — not yet uploaded` or
  `captured — upload failed or unavailable`.

Screenshots never block a push or PR.

## Upload after opening the draft PR

Upload only existing PNG captures under 10 MB, once on the home PR. Companion
PRs reuse the returned URLs.

1. Accept either Chromium cookie layout under
   `${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile`. If neither exists,
   retain degraded rendering and put this one-time instruction in the operator
   report, never the PR body:

   ```sh
   mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile"
   chmod 700 "${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile"
   npx playwright codegen --user-data-dir="${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile" https://github.com
   ```

   State that the profile stores an unencrypted GitHub session and can be
   revoked by signing out in that profile or deleting it.
2. `chmod 700` the profile. Launch a headless persistent Chromium context and
   open the PR. Require a `user-login` marker and no `/login` redirect.
3. For each image, pass path/caption as argv, attach it to GitHub's Markdown
   file input, wait at most 60 seconds for a
   `https://github.com/user-attachments/assets/<uuid>` URL, record it, and
   clear the textarea. Never submit a comment.
4. Rerender the entire section: successful captures use
   `![<caption>](<url>)`; failures retain caption and local path. A rerun
   replaces the section; uploaded URLs remain valid.

If UI changed on a later push, recapture, upload, and replace. If UI did not
change, carry the uploaded section through verbatim without re-uploading.
