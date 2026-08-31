---
title: Screenshots in PRs
description: "How the pipeline attaches inline UI screenshots to pull requests, and the one-time GitHub sign-in that enables the inline upload."
audience: [developer]
nav_order: 10
nav_label: screenshots
---

# Screenshots in PRs

For UI-touching changes, the pipeline attaches visual evidence to the PR. The
ux-reviewer captures screenshots of the affected pages during Implement.
`/team-pr` then uploads them through GitHub's user-attachments pipeline, so
they render inline in a `## Screenshots` section of the PR body. Non-UI
changes never get the section. Any capture or upload failure degrades to a
visible note with local file paths, so the PR always opens.

The images stay current the same way the description does. Every follow-up
push refreshes both: a push that changes the UI re-captures and re-uploads
the screenshots, and a push that leaves the UI alone keeps the ones already
embedded.

## One-time setup

Inline upload needs a one-time GitHub sign-in in a dedicated browser profile
at `${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile/`. `gh auth login`
is not enough, because the CLI token is not a GitHub web session and the
user-attachments upload works through the browser. Run:

```sh
mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile"
chmod 700 "${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile"
npx playwright codegen \
  --user-data-dir="${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile" \
  https://github.com
```

This opens a headed Chromium (a visible browser window) bound to that
profile: sign in to github.com once in that window, then close it. The
profile holds a full **unencrypted** github.com web session. To reset or
revoke it, sign out of github.com inside that profile or delete the
directory. Until you sign in, PRs carry local screenshot paths instead of
inline images.
