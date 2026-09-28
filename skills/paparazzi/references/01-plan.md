Resolve these links from the installed `SKILL.md` directory. If a read fails, stop and report its resolved path.

## Plan the shots

1. **Resolve the targets the caller named.** Map each named screen, state, or
   element to a path and the actions that reach it, reading the app's routes
   where a name is not already a path. When a name matches no screen, or more
   than one, or the caller named nothing, ask one question rather than guess,
   and create no output directory until it is answered.

2. **Choose the states.** Shoot the states the caller named. `populated`,
   `empty`, and `error` are the manifest's `state:` values. Interaction states
   reached by actions, such as an open menu, a hover, a focus ring, a
   validation message, or a modal, are named in the frame's name and caption.
   Shoot a loading state only when a `waitFor` locator can hold it, never a
   spinner caught by accident.

3. **Choose the variants.** Shoot the variants the caller named, each as its
   own shot:

   | The caller asks for | Set on the shot |
   | --- | --- |
   | Mobile or a breakpoint | `viewport`, such as `{"width": 390, "height": 844}` |
   | Dark mode | `colorScheme: "dark"` |
   | A language or locale | `locale` |
   | A timezone | `timezoneId` |
   | A sharper or smaller file | `deviceScaleFactor`, 1 to 3 |

4. **Frame each shot.** The default frame is the viewport at 1280×800 and
   device scale factor 2, with the subject on screen. Reach content below the
   fold with a `scroll` action. Use `fullPage` when the caller wants the whole
   page, and `target` when the caller names one element.

5. **Fit the cap.** Order the frames by how much of the request each proves.
   When the plan passes 10 frames, keep the most informative and record
   `N more states not captured` for the manifest's `## Skipped`.

The shot list itself is written after the app is up, in
[stage and shoot](02-shoot.md) step 4, because the origin is known only then.

## The shot list

The list names one `origin`, and each shot writes `<name>.png`:

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

`defaults` shows the values used when it is omitted. The origin may carry a
base path, such as `http://127.0.0.1:4000/team`.

| Field | Meaning |
| --- | --- |
| `name` | `NN-route-slug-state` plus any interaction or variant words, lowercase |
| `path` | Starts with `/`. It is appended to the origin, whose base path it keeps |
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
survives markup changes.
