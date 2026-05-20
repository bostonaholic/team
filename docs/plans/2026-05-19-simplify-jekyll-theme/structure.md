---
topic: simplify-jekyll-theme
date: 2026-05-19
phase: structure
approved: true
approved_at: 2026-05-19T00:00:00Z
revision: 1
---

# Structure: simplify-jekyll-theme

Six vertical slices, ordered safest-first so the pipeline can be halted
at any point without leaving `docs/` in a broken state. The site has no
test harness; every slice's mechanical gate is
`cd docs && bundle exec jekyll build --trace` succeeding, followed by a
one-line visual check on `/` and (where prose is in play) `/architecture`.

## Slices

### Slice 1: Delete pure dead code

**Goal:** Remove zero-reference SCSS so subsequent slices touch a smaller
surface area.
**Layers touched:** SCSS partials, SCSS entry point.
**Files changed:**
- `docs/_sass/_utilities.scss` (delete file, all 109 lines)
- `docs/_sass/_components.scss` (delete `.card`, `.card--interactive`,
  `.callout`, `.callout__icon`, `.callout__body`, `.callout--info`,
  `.callout--note`)
- `docs/_sass/_layout.scss` (delete `.container--wide`)
- `docs/assets/css/style.scss` (remove the `@import "utilities";` line)

**Verification checkpoint:** `bundle exec jekyll build --trace` passes;
`/` and `/architecture` render identically to pre-slice. No new console
errors. (Design Decisions 5, 6. Research §"Dead classes".)
**Acceptance criteria:**
- [ ] `_utilities.scss` file is gone and `style.scss` no longer references it
- [ ] grep for `\.card[^-]`, `\.callout`, `\.container--wide` across
      `docs/` returns zero hits
- [ ] Jekyll build succeeds with no SCSS warnings introduced
- [ ] Home and architecture pages render unchanged visually

**Atomic commit message:** `refactor(theme): drop unused utility partial and dead component classes`

---

### Slice 2: Drop Google Fonts; make `_tokens.scss` font stack honest

**Goal:** Remove the third-party network dependency and align declared
fonts with what actually renders.
**Layers touched:** `<head>` markup, SCSS tokens.
**Files changed:**
- `docs/_includes/head.html` (remove two `preconnect` links + the Google
  Fonts stylesheet `<link>`)
- `docs/_sass/_tokens.scss` (rewrite `--font-sans` to a system stack:
  `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; rewrite
  `--font-mono` to `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`)

**Verification checkpoint:** Build passes; DevTools Network tab shows no
requests to `fonts.googleapis.com` or `fonts.gstatic.com`; body type
visibly identical (was already falling through to system-ui — see
Research §"Font discrepancy"); code blocks render in OS monospace.
**Acceptance criteria:**
- [ ] Zero references to `fonts.googleapis.com` or `fonts.gstatic.com`
      anywhere under `docs/`
- [ ] `_tokens.scss` `--font-sans` no longer names `Geist` or `Inter`
- [ ] Pipeline SVG still renders (it depends on Space Grotesk — accepted
      trade-off; SVG goes away in Slice 4 anyway, and the
      `font-family="Space Grotesk"` attribute falls back to sans-serif
      cleanly until then)
- [ ] No console errors; build clean

**Atomic commit message:** `refactor(theme): drop Google Fonts and use honest system font stack`

> Note: The pipeline SVG's hardcoded `font-family="Space Grotesk"` will
> fall back to the SVG default sans-serif between Slices 2 and 4. This
> is visually mild (the SVG node labels) and intentional — the SVG is
> being deleted in Slice 4.

---

### Slice 3: Remove scroll-reveal motion

**Goal:** Delete the JS feature + CSS rules + template attributes for
scroll-reveal in one tightly-coupled commit.
**Layers touched:** JS, SCSS, layout markup.
**Files changed:**
- `docs/assets/js/main.js` (delete the `revealOnScroll` feature + its
  call site in the init wiring, ~25 lines)
- `docs/_sass/_components.scss` (delete `.reveal` and
  `.reveal--delay-{1..5}` rules)
- `docs/_layouts/home.html` (remove every `class="reveal*"` /
  `reveal reveal--delay-N` attribute; keep all other classes on those
  elements)
- `docs/_includes/feature-card.html` (remove any `reveal*` class output;
  the `delay` parameter on the include can stay unused or be dropped —
  if dropped, also remove the `delay:` arg from each `include`
  invocation in `home.html`)

**Verification checkpoint:** Build passes; home page renders all sections
visible immediately on load (no fade-in); DevTools console clean; grep
for `reveal` under `docs/` returns zero hits.
**Acceptance criteria:**
- [ ] No `reveal` class names appear anywhere under `docs/`
- [ ] `main.js` no longer contains `IntersectionObserver` for reveal
      (the TOC active-tracker observer stays)
- [ ] Home page sections are visible at first paint
- [ ] No console errors

**Atomic commit message:** `refactor(theme): remove scroll-reveal motion`

---

### Slice 4: Replace `_includes/pipeline.html` with inline styled `<ol>`

**Goal:** Drop the 360-line animated SVG and render the QRSPI pipeline
as a styled ordered list inline in `home.html`. (Design Decision 1.)
**Layers touched:** Includes, home layout, SCSS components.
**Files changed:**
- `docs/_includes/pipeline.html` (delete file)
- `docs/_layouts/home.html` (replace `{% include pipeline.html %}` with
  ~25 lines of `<ol class="pipeline-phases">` listing the 8 QRSPI phases
  with gate badges; keep the surrounding `.pipeline-section` shell
  untouched)
- `docs/_sass/_components.scss` (add or repurpose
  `.pipeline-phases` / `.pipeline-phases__item` / gate badge styles;
  the inline SVG fallback `<ol class="pipeline-phases">` rules already
  exist in `pipeline.html`'s inline `<style>` — port their useful
  selectors here, then delete the rest with the include)

**Verification checkpoint:** Build passes; home page shows a numbered
ordered list of the 8 phases (Question, Research, Design, Structure,
Plan, Worktree, Implement, PR) with gate markers on Design and Structure;
no SVG, no SMIL animation, no Space Grotesk reference; no console errors.
**Acceptance criteria:**
- [ ] `_includes/pipeline.html` no longer exists
- [ ] `home.html` renders all 8 QRSPI phases in order with the two
      human-gate markers visible
- [ ] Build is clean; no `Liquid Exception` from a missing include
- [ ] No remaining references to Space Grotesk in repo content
      (`grep -r "Space Grotesk" docs/` returns zero)

**Atomic commit message:** `refactor(theme): replace animated pipeline SVG with styled ordered list`

---

### Slice 5: Remove macOS-style code-block headers + copy button

**Goal:** Code blocks become plain styled `<pre>` elements; users
select-and-copy. (Design Decision 3.)
**Layers touched:** JS, SCSS components.
**Files changed:**
- `docs/assets/js/main.js` (delete the `wrapCodeBlocks` feature + its
  call site, ~70 lines including the clipboard fallback)
- `docs/_sass/_components.scss` (delete `.code-block-wrapper`,
  `.code-block-header`, `.code-block-header__dots`,
  `.code-block-header__lang`, `.code-block-header__actions`, `.copy-btn`)

**Verification checkpoint:** Build passes; visit `/architecture` (which
has shell code blocks); each `<pre>` renders without the macOS-style
header chrome; `_syntax.scss` token colors still apply (it targets
`.highlight`, which Rouge still emits — Research §"Hard constraints" #1
preserved); no console errors.
**Acceptance criteria:**
- [ ] No `.code-block-*` or `.copy-btn` class definitions remain
- [ ] `main.js` no longer queries `div.highlight` to wrap it
- [ ] Code blocks on `/architecture` render with syntax highlighting
      intact but no header chrome
- [ ] No console errors when viewing `/architecture`

**Atomic commit message:** `refactor(theme): drop macOS-style code-block headers and copy buttons`

---

### Slice 6: Collapse theme toggle to `prefers-color-scheme` only

**Goal:** Remove the manual toggle machinery; let the OS decide.
(Design Decision 2.) Saved for last because it touches the most files
and is the most cross-cutting.
**Layers touched:** `<head>`, header markup, JS, SCSS tokens, default layout.
**Files changed:**
- `docs/_includes/head.html` (delete the pre-paint inline `<script>` that
  reads `localStorage 'team-theme'`)
- `docs/_includes/header.html` (delete the `.theme-toggle` button markup,
  the `.icon-moon` / `.icon-sun` SVGs, and any associated wrapper)
- `docs/assets/js/main.js` (delete the `setupThemeToggle` feature + its
  call site, ~20 lines)
- `docs/_sass/_tokens.scss` (change the light-palette block from
  `[data-theme="light"] { ... }` to
  `@media (prefers-color-scheme: light) { :root { ... } }`)
- `docs/_sass/_syntax.scss` (change the light-mode block from
  `[data-theme="light"] .highlight { ... }` to
  `@media (prefers-color-scheme: light) { .highlight { ... } }`)
- `docs/_sass/_layout.scss` (delete `.theme-toggle`, `.icon-moon`,
  `.icon-sun` rules if present)
- `docs/_layouts/default.html` (remove `data-theme="dark"` from the
  `<html>` tag — default media query handles it)

**Verification checkpoint:** Build passes; on a system in dark mode the
page renders dark; flipping the OS to light mode flips the palette
(including code-block syntax colors). No console errors. `grep -r
"team-theme\|data-theme\|theme-toggle" docs/` returns zero hits.
**Acceptance criteria:**
- [ ] No reference to `localStorage`, `team-theme`, `data-theme`, or
      `theme-toggle` remains anywhere under `docs/`
- [ ] `_tokens.scss` and `_syntax.scss` both use
      `@media (prefers-color-scheme: light)` for the light palette
- [ ] OS dark/light preference visibly switches the palette on both
      pages (manual check by toggling system appearance)
- [ ] Build clean; no console errors

**Atomic commit message:** `refactor(theme): collapse manual theme toggle to prefers-color-scheme`

---

## Cross-slice concerns

- **`_syntax.scss` light-mode block.** Slice 6 must rewrite its
  `[data-theme="light"] .highlight` selector to a `prefers-color-scheme`
  media query, not delete it. Slice 5 (code-block headers) does **not**
  touch `_syntax.scss` — the two slices are independent.
- **Rouge contract preserved end-to-end.** Every slice keeps Rouge's
  `<div class="highlight"><pre>...</pre></div>` markup intact. No slice
  changes `_config.yml`'s `css_class: "highlight"`. (Research §"Hard
  constraints" #1, #2.)
- **`main.js` shrinks incrementally.** Slices 3, 5, and 6 each remove
  one feature from the IIFE. After all three, what survives is: mobile
  nav, heading anchors, TOC active-tracker, and init wiring (~80 lines
  per design impact estimate).
- **The `home.html` `class="reveal*"` attributes** (Slice 3) and the
  `{% include pipeline.html %}` call (Slice 4) both live in `home.html`
  — be careful to not double-edit the same lines across slices.
- **`_components.scss` is edited by Slices 1, 3, 4, 5.** Each slice
  removes a disjoint block; no slice depends on another's deletions
  surviving. If a slice is bailed, the others still build.

## Out of structure

- `_prose.scss` audit — deferred per design "Open questions".
- `footer.html` slimming — deferred per design "Open questions".
- Rouge config or `css_class` changes — design "Out of scope".
- Adding a test harness under `docs/` — design "Out of scope".
- Touching `_config.yml` plugins — design "Out of scope".
- Restyling the home page beyond replacing the pipeline interior —
  design "Out of scope". Hero, stats row, features grid, CTA section
  keep their look.
- Markdown source changes in `index.md` or `architecture.md` — design
  "Out of scope".

## Final verification (cumulative, end of branch)

Run all of the following after Slice 6 lands:

1. `cd docs && bundle exec jekyll build --trace` — clean build, no
   warnings introduced by this branch.
2. `bundle exec jekyll serve` and visit `/` — home page renders hero,
   stats row, pipeline (now an `<ol>`), features grid, CTA. No SVG
   animation. No fade-in motion.
3. Visit `/architecture` — full prose, sticky TOC, heading anchors on
   hover, syntax-highlighted code blocks (no macOS-style header).
4. DevTools Network tab on both pages — no requests to
   `fonts.googleapis.com` or `fonts.gstatic.com`. No 404s on assets.
5. DevTools Console on both pages — zero errors, zero warnings from
   `main.js`.
6. Toggle OS appearance dark ↔ light — palette switches on both pages,
   including code-block syntax colors.
7. Mobile viewport (≤768px) — hamburger opens the mobile nav; Escape
   and click-outside both close it.
8. `grep -rE "reveal|Space Grotesk|team-theme|data-theme|theme-toggle|code-block-|\\.callout|\\.card[^-]|container--wide|fonts\\.googleapis" docs/`
   returns zero matches.
