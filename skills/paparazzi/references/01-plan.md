Resolve these links from the installed `SKILL.md` directory. If a read fails, stop and report its resolved path.

## Plan the shots

1. **Resolve the before side.** Skip this step with `--after-only`.

   ```bash
   BASE="${BASE_ARG:-$(gh pr view --json baseRefName --jq .baseRefName 2>/dev/null)}"
   BASE="${BASE:-$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')}"
   BASE="${BASE:-main}"
   printf '%s' "$BASE" | LC_ALL=C grep -Eq '^[A-Za-z0-9._/][A-Za-z0-9._/-]*$' || exit 1
   git rev-parse --verify --quiet "origin/$BASE^{commit}" >/dev/null && BASE_REF="origin/$BASE" || BASE_REF="$BASE"
   MERGE_BASE="$(git merge-base "$BASE_REF" HEAD)" || exit 1
   ```

   `BASE_ARG` is the `--base` value. A value failing the allowlist is a refusal
   that names it. The before side is the merge-base, not the base tip, so work
   that landed on the base since the branch forked never shows up as this
   branch's change.

   The after side is the working tree, uncommitted and untracked edits
   included: what the user sees now. When `git status --porcelain` is not
   empty, the report says so.

2. **Read the change.** `git diff "$MERGE_BASE"` and
   `git ls-files --others --exclude-standard` are the whole change. Classify the
   surface with the brief's [detection rules](../code-review/references/ux-reviewer.md#detection-and-surface)
   and apply its UI-impact gate from `## Screenshot Capture (UI projects)`.
   With no UI change and no named request, stop and report
   `No UI change to shoot: <a reason a reader can check>`. Create no output
   directory. When UI impact is uncertain, shoot.

3. **Map each change to the screens that render it.** Trace every changed
   file to a URL or a native screen, and record the chain, such as
   `Button.tsx → SettingsForm.tsx → /settings`. A route or page file names its
   route. A component follows its importers until one does. A style, token, or
   class leads to the screens using it, and a copy or translation key to the
   screens rendering it. A backend, data, or configuration change leads to the
   screens rendering what it changed. A screen with no chain is a guess, so
   leave it out. Choose the fewest screens that show every changed surface.
   When one component appears on many screens, shoot it where it is most
   prominent and name the others in the report.

4. **Choose the states.** Shoot only the states the diff changes. `populated`,
   `empty`, and `error` are the manifest's `state:` values. Interaction states
   reached by actions, such as an open menu, a hover, a focus ring, a validation
   message, or a modal, are named in the frame's name and caption. Shoot a
   loading state only when a `waitFor` locator can hold it, never a spinner
   caught by accident.

5. **Choose the variants the diff touches, and no others.**

   | The diff touches | Add a shot with |
   | --- | --- |
   | Media queries, breakpoints, responsive classes | `viewport: {"width": 390, "height": 844}` |
   | Theme, color tokens, dark-mode styles | `colorScheme: "dark"` |
   | Translations, locale formatting | The affected `locale` |
   | Rendered dates or times | The affected `timezoneId` |

6. **Frame the change.** A frame is the viewport at 1280×800 and device scale
   factor 2, with the change on screen. Reach content below the fold with a
   `scroll` action, never a full-page shot, which can pass the 10 MB
   attachment bound. A small change also gets a `target` crop, decided from
   the pair diff in [verify](03-verify.md). A new screen is `sides: ["after"]`,
   and a removed one is `sides: ["before"]`.

7. **Fit the cap.** Order the frames by how much of the change each proves.
   When the plan passes 10 frames, keep the most informative and record
   `N more states not captured` for the manifest's `## Skipped`.

The shot list itself is written after both apps are up, in
[stage and shoot](02-shoot.md) step 5, because the origins are known only then.

## The shot list

```json
{
  "origins": { "before": "http://127.0.0.1:4101", "after": "http://127.0.0.1:4100" },
  "defaults": { "viewport": { "width": 1280, "height": 800 }, "deviceScaleFactor": 2, "colorScheme": "light", "locale": "en-US", "timezoneId": "UTC" },
  "shots": [
    {
      "name": "01-settings-populated-edit",
      "path": "/settings",
      "actions": [{ "click": { "role": "button", "name": "Edit profile" } }, { "fill": { "label": "Name" }, "value": "Ada Lovelace" }, { "press": "Tab" }],
      "waitFor": { "text": "Unsaved changes" },
      "mask": [".last-seen"],
      "hide": ["#cookie-banner"]
    }
  ]
}
```

`defaults` shows the values used when it is omitted. An origin may carry a base
path, such as `http://127.0.0.1:4000/team`, and omitting `before` makes every
shot after-only.

| Field | Meaning |
| --- | --- |
| `name` | `NN-route-slug-state` plus any interaction or variant words, lowercase. The frame file is `<name>-<side>.png` |
| `path` | Starts with `/`. It is appended to each origin, whose base path it keeps |
| `sides` | Every origin by default |
| `actions` | Run in order. `click`, `hover`, `check`, and `scroll` take a locator, `fill` takes a locator and a `value`, and `press` takes a key name |
| `waitFor` | A locator that must be visible before the shot. It is the proof that the state was reached |
| `target` | Crop to this element plus 16 CSS px of context |
| `mask` | Locators painted gray, for timestamps, avatars, generated IDs, and anything else that changes between runs |
| `hide` | Locators made invisible, for cookie banners, dev-tool badges, and toasts covering the change |
| `expectStatus` | The status an intended error page returns. Otherwise any status of 400 or more fails the frame |
| `viewport`, `deviceScaleFactor`, `colorScheme`, `locale`, `timezoneId` | This shot's override of `defaults` |

A locator is a selector string, or one of `{"role", "name"}`, `{"text"}`,
`{"label"}`, and `{"testId"}`, each matched exactly as the brief's locator-scope
rule requires. Prefer a role or label to CSS, because an accessible name
survives the markup changes a before/after pair spans.
