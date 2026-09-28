Resolve these links from the installed `SKILL.md` directory. If a read fails, stop and report its resolved path.

## Plan the shots

1. **Take the mode from the caller.** `--compare`, or a request in the text for
   before and after, makes a comparison. Anything else is a capture.

2. **Resolve the base** when the run compares, or when the caller named no
   targets and the change must supply them. Skip this step otherwise.

   ```bash
   BASE="${BASE_ARG:-$(gh pr view --json baseRefName --jq .baseRefName 2>/dev/null)}"
   BASE="${BASE:-$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')}"
   BASE="${BASE:-main}"
   printf '%s' "$BASE" | LC_ALL=C grep -Eq '^[A-Za-z0-9._/][A-Za-z0-9._/-]*$' || exit 1
   git rev-parse --verify --quiet "origin/$BASE^{commit}" >/dev/null && BASE_REF="origin/$BASE" || BASE_REF="$BASE"
   MERGE_BASE="$(git merge-base "$BASE_REF" HEAD)" || exit 1
   ```

   `BASE_ARG` is the `--base` value. A value failing the allowlist is a refusal
   that names it. A comparison's before side is the merge-base, not the base
   tip, so work that landed on the base since the branch forked never shows up
   as this branch's change. Its after side is the working tree, uncommitted and
   untracked edits included: what the user sees now. When
   `git status --porcelain` is not empty, the report says so.

3. **Choose the targets.**
   - **Named by the caller.** Resolve each named screen, state, or element to a
     path and the actions that reach it, reading the app's routes where a name
     is not already a path. When a name matches no screen, or more than one,
     ask one question rather than guess.
   - **Named by no one.** The change supplies them. `git diff "$MERGE_BASE"`
     and `git ls-files --others --exclude-standard` are the whole change.
     Classify the surface with the brief's
     [detection rules](../code-review/references/ux-reviewer.md#detection-and-surface),
     apply its UI-impact gate from `## Screenshot Capture (UI projects)`, and
     map the change to screens in step 4. When UI impact is uncertain, shoot.
     With no UI change, ask the caller which screens to shoot, and create no
     output directory.

4. **Map each change to the screens that render it**, for targets the change
   supplied. Trace every changed file to a URL or a native screen, and record
   the chain, such as `Button.tsx → SettingsForm.tsx → /settings`. A route or
   page file names its route. A component follows its importers until one
   does. A style, token, or class leads to the screens using it, and a copy or
   translation key to the screens rendering it. A backend, data, or
   configuration change leads to the screens rendering what it changed. A
   screen with no chain is a guess, so leave it out. Choose the fewest screens
   that show every changed surface. When one component appears on many
   screens, shoot it where it is most prominent and name the others in the
   report.

5. **Choose the states.** Shoot the states the caller named, or, for targets
   the change supplied, the states the diff changes. `populated`, `empty`, and
   `error` are the manifest's `state:` values. Interaction states reached by
   actions, such as an open menu, a hover, a focus ring, a validation message,
   or a modal, are named in the frame's name and caption. Shoot a loading state
   only when a `waitFor` locator can hold it, never a spinner caught by
   accident.

6. **Choose the variants.** Shoot the variants the caller named. For targets
   the change supplied, add only the variants the diff touches:

   | The diff touches | Add a shot with |
   | --- | --- |
   | Media queries, breakpoints, responsive classes | `viewport: {"width": 390, "height": 844}` |
   | Theme, color tokens, dark-mode styles | `colorScheme: "dark"` |
   | Translations, locale formatting | The affected `locale` |
   | Rendered dates or times | The affected `timezoneId` |

7. **Frame each shot.** The default frame is the viewport at 1280×800 and
   device scale factor 2, with the subject on screen. Reach content below the
   fold with a `scroll` action. Use `fullPage` when the caller wants the whole
   page, and `target` when the caller names one element. A comparison's small
   change also gets a `target` crop, decided from the pair diff in
   [verify](03-verify.md). In a comparison, a new screen is `sides: ["after"]`,
   and a removed one is `sides: ["before"]`.

8. **Fit the cap.** Order the frames by how much of the request each proves.
   When the plan passes 10 frames, keep the most informative and record
   `N more states not captured` for the manifest's `## Skipped`.

The shot list itself is written after the app is up, in
[stage and shoot](02-shoot.md) step 5, because the origins are known only then.

## The shot list

A capture names one `origin`, and each shot writes `<name>.png`:

```json
{
  "origin": "http://127.0.0.1:4100",
  "defaults": { "viewport": { "width": 1280, "height": 800 }, "deviceScaleFactor": 2, "colorScheme": "light", "locale": "en-US", "timezoneId": "UTC" },
  "shots": [
    { "name": "01-pricing-populated", "path": "/pricing", "fullPage": true, "hide": ["#cookie-banner"] },
    {
      "name": "02-settings-populated-edit",
      "path": "/settings",
      "actions": [{ "click": { "role": "button", "name": "Edit profile" } }, { "fill": { "label": "Name" }, "value": "Ada Lovelace" }, { "press": "Tab" }],
      "waitFor": { "text": "Unsaved changes" },
      "target": { "testId": "profile-card" },
      "mask": [".last-seen"]
    }
  ]
}
```

A comparison replaces `origin` with both sides, and each shot writes
`<name>-before.png` and `<name>-after.png`:

```json
{ "origins": { "before": "http://127.0.0.1:4101", "after": "http://127.0.0.1:4100" }, "shots": [{ "name": "01-settings-populated", "path": "/settings" }] }
```

`defaults` shows the values used when it is omitted. An origin may carry a base
path, such as `http://127.0.0.1:4000/team`.

| Field | Meaning |
| --- | --- |
| `name` | `NN-route-slug-state` plus any interaction or variant words, lowercase |
| `path` | Starts with `/`. It is appended to each origin, whose base path it keeps |
| `sides` | Comparisons only. Both sides by default |
| `actions` | Run in order. `click`, `hover`, `check`, and `scroll` take a locator, `fill` takes a locator and a `value`, and `press` takes a key name |
| `waitFor` | A locator that must be visible before the shot. It is the proof that the state was reached |
| `target` | Crop to this element plus 16 CSS px of context |
| `fullPage` | Capture the whole scrollable page. It excludes `target` |
| `mask` | Locators painted gray, for timestamps, avatars, generated IDs, and anything else that changes between runs |
| `hide` | Locators made invisible, for cookie banners, dev-tool badges, and toasts covering the subject |
| `expectStatus` | The status an intended error page returns. Otherwise any status of 400 or more fails the frame |
| `viewport`, `deviceScaleFactor`, `colorScheme`, `locale`, `timezoneId` | This shot's override of `defaults` |

A locator is a selector string, or one of `{"role", "name"}`, `{"text"}`,
`{"label"}`, and `{"testId"}`, each matched exactly as the brief's locator-scope
rule requires. Prefer a role or label to CSS, because an accessible name
survives markup changes, including the ones a before/after pair spans.
