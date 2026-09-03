# Screenshot upload

Run only when `screenshots/manifest.md` exists.

## Render

- Missing manifest: omit `## Screenshots`.
- Malformed or `skipped-*` manifest: render one failure note.
- Captured entry with a present PNG: render caption, state, and local path.
- Missing PNG: skip it and name the discrepancy.
- Partial capture: state how many states were skipped.
- Upload unavailable/failed: retain local paths with a degraded note.

## Upload

Open the draft PR first. Upload once through the home PR; companion bodies reuse
the resulting URLs.

1. Look for the persistent Chromium profile at
   `${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile`, accepting either
   `Default/Cookies` or `Default/Network/Cookies`. If absent, keep the degraded
   body and report this one-time sign-in command to the operator, not the PR:

   ```sh
   mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile"
   chmod 700 "${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile"
   npx playwright codegen \
     --user-data-dir="${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile" \
     https://github.com
   ```

   The profile holds an unencrypted GitHub session. Signing out through that
   profile or deleting it revokes access.
2. Set profile permissions to 700. Launch a headless persistent Chromium
   context and verify the PR page is signed in; an expired session takes the
   degraded path.
3. For each existing PNG under 10 MB, pass its path and caption as argv, attach
   it to the markdown textarea, wait at most 60 seconds for a
   `https://github.com/user-attachments/assets/<uuid>` URL, record the URL,
   then clear the textarea. Never submit a comment.
4. Replace the Screenshots section through `gh pr edit --body-file`.
   Successful images use caption/state plus markdown image URL. List failed or
   oversized images with local paths. Preserve partial successes.

Re-running the phase replaces the section. Previously uploaded URLs remain
valid. Every failure path leaves an open draft and visible degraded note.
After a UI-changing follow-up push, call the Skill tool with `verifying-ux`,
recapture, and replace the section. Preserve the existing URLs when the push
did not change UI.
