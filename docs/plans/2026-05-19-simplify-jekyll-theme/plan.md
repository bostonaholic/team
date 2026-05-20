---
topic: simplify-jekyll-theme
date: 2026-05-19
phase: plan
---

# Plan: simplify-jekyll-theme

## Context

Six vertical slices from `docs/plans/2026-05-19-simplify-jekyll-theme/structure.md`
collapse the Jekyll theme under `docs/` to match a two-page site: drop dead
SCSS, drop Google Fonts, remove scroll-reveal motion, replace the animated
pipeline SVG with a styled `<ol>`, remove macOS-style code-block chrome, and
collapse the theme toggle to `prefers-color-scheme`. The site has no test
harness, so per-slice verification is `cd docs && bundle exec jekyll build
--trace` plus targeted `grep` assertions on the source tree. Each slice is
atomic — bail at any slice boundary and `docs/` still builds.

## Slices

### Slice 1: Delete pure dead code

**Acceptance tests** (from structure.md):
- File `docs/_sass/_utilities.scss` no longer exists.
- `style.scss` no longer references the `utilities` partial.
- Grep across `docs/` for `\.card[^-]`, `\.callout`, `\.container--wide`
  returns zero matches.
- `cd docs && bundle exec jekyll build --trace` succeeds with no new SCSS
  warnings.

**Steps:**

1. `docs/_sass/_utilities.scss` — Delete the entire file (109 lines).
   `[parallel]`
2. `docs/_sass/_components.scss` — Read first; the dead blocks are
   contiguous. Delete:
   - `.card { ... }` block (lines ~120–132).
   - `.card--interactive { ... }` block (lines ~134–144).
   - The entire `.callout { ... }` block including nested `&__icon`,
     `&__body`, `&--info`, `&--note` (lines ~371–417). Leave every other
     block in this file untouched — Slices 3/4/5 will edit different
     blocks in the same file.
   `[parallel]`
3. `docs/_sass/_layout.scss` — Read first. Delete the `.container--wide`
   rule (lines 24–26). Keep `.container` and `.container--narrow`.
   `[parallel]`
4. `docs/assets/css/style.scss` — Delete the line `@import "utilities";`
   (currently line 15). Do this **after** step 1 to avoid an inconsistent
   state if `jekyll serve` is running. `[sequential, after step 1]`

**Verification:**
- `test ! -f docs/_sass/_utilities.scss` (file gone)
- `! grep -n 'utilities' docs/assets/css/style.scss`
- `! grep -RnE '\.card[^-a-zA-Z_]|\.card--interactive|\.callout|\.container--wide' docs/_sass docs/_includes docs/_layouts docs/*.md`
- `cd docs && bundle exec jekyll build --trace` (mechanical gate)

**Commit:** `refactor(theme): drop unused utility partial and dead component classes`

---

### Slice 2: Drop Google Fonts; make `_tokens.scss` font stack honest

**Acceptance tests** (from structure.md):
- Zero references to `fonts.googleapis.com` or `fonts.gstatic.com` under
  `docs/`.
- `_tokens.scss` `--font-sans` no longer names Geist or Inter.
- Build clean.

**Steps:**

1. `docs/_includes/head.html` — Delete lines 11–14 (the `<!-- Fonts -->`
   comment, both `<link rel="preconnect">` lines, and the
   `fonts.googleapis.com/css2?...` stylesheet `<link>`). Keep everything
   else in `head.html` untouched (the pre-paint theme `<script>` at lines
   22–30 goes in Slice 6, not here). `[parallel]`
2. `docs/_sass/_tokens.scss` — Edit line 36 (`--font-sans`) to
   `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` and line 37
   (`--font-mono`) to
   `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`. Leave the
   rest of the file untouched — Slice 6 rewrites the bottom block.
   `[parallel]`

**Verification:**
- `! grep -RnE 'fonts\.(googleapis|gstatic)\.com' docs/`
- `! grep -nE "'Geist'|'Inter'|'JetBrains Mono'|'Fira Code'" docs/_sass/_tokens.scss`
- `cd docs && bundle exec jekyll build --trace`
- Manual: load `/`; the pipeline SVG labels fall back to generic sans-serif
  (accepted trade-off — SVG goes away in Slice 4). Network tab shows no
  request to `fonts.googleapis.com` or `fonts.gstatic.com`.

**Commit:** `refactor(theme): drop Google Fonts and use honest system font stack`

---

### Slice 3: Remove scroll-reveal motion

**Acceptance tests** (from structure.md):
- No `reveal` class names appear anywhere under `docs/`.
- `main.js` no longer contains the reveal `IntersectionObserver` (the TOC
  observer at lines 260–273 stays).
- Build clean.

**Steps:**

1. `docs/assets/js/main.js` — Delete the entire scroll-reveal block: the
   `prefersReduced` declaration, `revealAll()` helper, and the
   `if (!prefersReduced && 'IntersectionObserver' in window) { ... } else
   { revealAll(); }` block (lines 66–90). Do **not** touch the TOC
   `IntersectionObserver` later in the file (lines 260–273) — that one
   stays. `[parallel]`
2. `docs/_sass/_components.scss` — Delete the `.reveal { ... }` block and
   the five `.reveal--delay-{1..5}` rules (lines 725–741, at the end of
   the file). `[parallel]`
3. `docs/_layouts/home.html` — Read first. Remove every `reveal`,
   `reveal--delay-N` class token from `class="..."` attributes while
   leaving every other class intact. Specific touches:
   - Line 33: `class="stats-row reveal"` → `class="stats-row"`
   - Line 53: `class="pipeline-section__header reveal"` →
     `class="pipeline-section__header"`
   - Line 61: replace the entire `<div class="reveal reveal--delay-2">`
     wrapper around `{% include pipeline.html %}` with a bare
     `<div>` (or unwrap entirely; the include doesn't need a wrapper).
     **Coordination with Slice 4:** Slice 4 replaces the
     `{% include pipeline.html %}` line itself. Here in Slice 3, only
     remove `reveal*` classes from the wrapper; do not delete the
     include call. `[sequential — must be done before Slice 4's edit
     to this same region]`
   - Line 69: `class="prose reveal"` → `class="prose"`
   - Line 77: `class="features-section__header reveal"` →
     `class="features-section__header"`
   - Line 143: `class="cta-section__inner reveal"` →
     `class="cta-section__inner"`
4. `docs/_includes/feature-card.html` — Read first. Delete the
   `reveal{% if include.delay %} reveal--delay-{{ include.delay }}{% endif
   %}` portion from the `class="feature-card ..."` attribute on line 11,
   leaving `class="feature-card"`. The `include.delay` parameter is now
   unused; leave the include-comment header alone (defer cleanup —
   harmless). Do **not** edit each `{% include feature-card.html ...
   delay="N" %}` invocation in `home.html` (the unused `delay` arg is
   silently ignored by Jekyll). `[parallel with step 3 except for
   `home.html` line 61 — see note above]`

**Verification:**
- `! grep -RnE '\breveal\b|\breveal--delay-' docs/_layouts docs/_includes docs/_sass docs/assets/js`
- `! grep -n 'revealOnScroll\|revealAll\|revealObserver' docs/assets/js/main.js`
- `cd docs && bundle exec jekyll build --trace`
- Manual: load `/`; sections are visible at first paint, no fade-in;
  DevTools console clean.

**Commit:** `refactor(theme): remove scroll-reveal motion`

---

### Slice 4: Replace `_includes/pipeline.html` with inline styled `<ol>`

**Acceptance tests** (from structure.md):
- `docs/_includes/pipeline.html` no longer exists.
- `home.html` renders all 8 QRSPI phases in order with the two human-gate
  markers visible.
- Build clean — no Liquid Exception from a missing include.
- `grep -r "Space Grotesk" docs/` returns zero matches.

**Steps:**

1. `docs/_includes/pipeline.html` — Delete the entire 360-line file.
   The mobile-fallback `<ol class="pipeline-phases">` at lines 181–219
   and the inline `<style>` block at lines 222–360 are the reference for
   the rewrite below — read them first, then delete the whole file.
   `[sequential — must precede step 2]`
2. `docs/_layouts/home.html` — Replace the line
   `{% include pipeline.html %}` (currently line 62, possibly now inside
   the bare `<div>` left after Slice 3 step 3) with the inline `<ol>`
   below. The 8 QRSPI phase names come from `skills/team/SKILL.md`'s
   phase table (Question, Research, Design, Structure, Plan, Worktree,
   Implement, PR). Render exactly this markup (newlines/indentation as
   you like; the structure is what's load-bearing):

   ```html
   <ol class="pipeline-phases" aria-label="QRSPI pipeline phases">
     <li class="pipeline-phases__item">
       <span class="pipeline-phases__num">01</span>
       <span class="pipeline-phases__name">Question</span>
     </li>
     <li class="pipeline-phases__item">
       <span class="pipeline-phases__num">02</span>
       <span class="pipeline-phases__name">Research</span>
       <span class="badge badge--muted">blind</span>
     </li>
     <li class="pipeline-phases__item pipeline-phases__item--gate">
       <span class="pipeline-phases__num">03</span>
       <span class="pipeline-phases__name">Design</span>
       <span class="badge badge--gate">human gate</span>
     </li>
     <li class="pipeline-phases__item pipeline-phases__item--gate">
       <span class="pipeline-phases__num">04</span>
       <span class="pipeline-phases__name">Structure</span>
       <span class="badge badge--gate">human gate</span>
     </li>
     <li class="pipeline-phases__item">
       <span class="pipeline-phases__num">05</span>
       <span class="pipeline-phases__name">Plan</span>
     </li>
     <li class="pipeline-phases__item">
       <span class="pipeline-phases__num">06</span>
       <span class="pipeline-phases__name">Worktree</span>
     </li>
     <li class="pipeline-phases__item">
       <span class="pipeline-phases__num">07</span>
       <span class="pipeline-phases__name">Implement</span>
       <span class="badge badge--muted">5 reviewers</span>
     </li>
     <li class="pipeline-phases__item pipeline-phases__item--end">
       <span class="pipeline-phases__num">08</span>
       <span class="pipeline-phases__name">PR</span>
       <span class="badge badge--accent">shipped</span>
     </li>
   </ol>
   ```

   Keep the surrounding `<section class="pipeline-section">` and
   `.pipeline-section__header` markup at lines 51–60 exactly as-is.
   `[sequential — must follow step 1]`
3. `docs/_sass/_components.scss` — Append a new section at the end of
   the file (after the stats-row block — and after Slice 3 removed the
   `.reveal*` rules) with selectors:
   - `.pipeline-phases` — `list-style: none; padding: 0; margin: 0;
     display: flex; flex-direction: column; gap: var(--space-2);` (port
     from `pipeline.html`'s inline style lines 295–303).
   - `.pipeline-phases__item` — `display: flex; align-items: center;
     gap: var(--space-3); padding: var(--space-3) var(--space-4);
     background: var(--bg-1); border: 1px solid var(--border-subtle);
     border-radius: var(--radius-md);` (port from lines 315–323).
   - `.pipeline-phases__item--gate` — `border-color: rgba(255, 184, 0,
     0.2); background: rgba(255, 184, 0, 0.04);` (port from lines
     325–328).
   - `.pipeline-phases__item--end` — `border-color: rgba(0, 212, 255,
     0.2); background: rgba(0, 212, 255, 0.04);` (port from lines
     330–333).
   - `.pipeline-phases__num` — `font-family: var(--font-mono);
     font-size: var(--text-xs); color: var(--accent); min-width: 24px;`
     (port from lines 335–340). Add nested overrides so gate items
     colour the num amber and end item colours the num cyan-bright:
     `.pipeline-phases__item--gate .pipeline-phases__num { color:
     var(--gate); }` (replaces the inline `style="color:var(--gate)"`
     attributes that were on lines 192, 197 of the old include).
   - `.pipeline-phases__name` — `font-weight: var(--weight-semibold);
     color: var(--text-primary); font-size: var(--text-sm); flex: 1;`
     (port from lines 342–347).
   - Inside `.pipeline-phases__item`, scope the `.badge` selector:
     `.badge { font-size: 0.6rem; padding: 1px 5px; }` to replace the
     inline `style="font-size:0.6rem;padding:1px 5px;"` attributes from
     the old include.
   `[parallel with steps 1–2 once file is read]`

**Verification:**
- `test ! -f docs/_includes/pipeline.html`
- `! grep -RnE 'pipeline\.html|Space Grotesk' docs/`
- `! grep -RnE 'pipeline-svg|pipe-line|phase-node|flow-particles' docs/`
- `cd docs && bundle exec jekyll build --trace` (will fail loudly with
  Liquid Exception if any `{% include pipeline.html %}` reference
  survives)
- Manual: load `/`; the pipeline section shows an 8-item numbered list
  with the Design and Structure rows in amber and PR row in cyan; no
  SVG; no SMIL animation; DevTools console clean.

**Commit:** `refactor(theme): replace animated pipeline SVG with styled ordered list`

---

### Slice 5: Remove macOS-style code-block headers + copy button

**Acceptance tests** (from structure.md):
- No `.code-block-*` or `.copy-btn` class definitions remain.
- `main.js` no longer queries `div.highlight` to wrap it.
- Code blocks on `/architecture` render with syntax highlighting intact,
  no header chrome.

**Steps:**

1. `docs/assets/js/main.js` — Delete:
   - The `makeCopySvg()` function (lines 92–119).
   - The `buildHeader()` function (lines 121–157).
   - The `detectLang()` function (lines 159–164).
   - The `wrapCodeBlocks()` function (lines 166–208).
   - The `copyText()` function (lines 210–229).
   - The `fallbackCopy()` function (lines 231–240).
   - The `wrapCodeBlocks();` call inside `init()` (line 295). Leave
     `initToc();` and `addAnchorLinks();` in `init()`. `[parallel]`
2. `docs/_sass/_components.scss` — Delete:
   - `.code-block-wrapper { ... }` block (lines ~206–213).
   - `.code-block-header { ... }` block including `&__lang`, `&__dots`,
     `&__actions` nested blocks (lines ~215–251).
   - `.copy-btn { ... }` block (lines ~253–282).
   - Keep the `div.highlight, .highlight { ... }` block at lines
     ~284–299 untouched — that's the Rouge wrapper styling and
     Research §"Hard constraints" #1 requires it to stay.
   - Keep `pre:not(.highlight pre) { ... }` at lines ~302–313 untouched.
   `[parallel]`

**Verification:**
- `! grep -RnE 'code-block-(wrapper|header)|\.copy-btn|wrapCodeBlocks|makeCopySvg|buildHeader|detectLang|copyText|fallbackCopy' docs/`
- `grep -n 'div\.highlight' docs/assets/js/main.js` — should return zero.
- `grep -n '\.highlight' docs/_sass/_components.scss` — should still
  match the Rouge wrapper block (just `div.highlight, .highlight { ... }`).
- `cd docs && bundle exec jekyll build --trace`
- Manual: load `/architecture`; shell snippet `<pre>` blocks render with
  syntax highlighting (Rouge `.highlight` token colours from
  `_syntax.scss` still apply) but no macOS dots header, no Copy button;
  DevTools console clean.

**Commit:** `refactor(theme): drop macOS-style code-block headers and copy buttons`

---

### Slice 6: Collapse theme toggle to `prefers-color-scheme` only

Saved for last because it touches the most files and is the most
cross-cutting. After Slice 5, `main.js` is small enough that this slice
removes the last cross-file coupling.

**Acceptance tests** (from structure.md):
- Zero references to `localStorage`, `team-theme`, `data-theme`, or
  `theme-toggle` anywhere under `docs/`.
- `_tokens.scss` and `_syntax.scss` both use
  `@media (prefers-color-scheme: light)` for the light palette.
- OS dark/light preference visibly switches the palette.

**Steps:**

1. `docs/_includes/head.html` — Delete the pre-paint inline `<script>`
   block (lines 22–30, the `<!-- Theme: apply before paint -->` comment
   plus the `(function() { ... })();` IIFE). Leave the canonical link
   below it intact. `[parallel]`
2. `docs/_includes/header.html` — Delete:
   - The `<!-- Theme toggle -->` comment plus the entire `<button
     class="theme-toggle" ...> ... </button>` element (lines 40–56,
     including the moon and sun SVGs inside).
   - Keep the surrounding `<div class="site-header__actions">` wrapper
     and the GitHub `<a>` and mobile-toggle `<button>` siblings
     untouched. `[parallel]`
3. `docs/assets/js/main.js` — Delete:
   - The `THEME_KEY` constant (line 11).
   - The `getTheme()` function (lines 13–17).
   - The `applyTheme()` function (lines 19–22).
   - The `themeBtn` lookup and `if (themeBtn) { ... }` block
     (lines 24–31).
   - The `window.matchMedia('(prefers-color-scheme: light)')
     .addEventListener(...)` block (lines 33–37). The browser handles
     the media query natively after this slice; no JS needed.
   - The `// ── Theme toggle ──` section comment (line 10).
   - Keep the `'use strict';` line and the IIFE wrapper. After this
     plus Slices 3 and 5, `main.js` should contain only: mobile nav,
     TOC tracking (`initToc`), heading anchors (`addAnchorLinks`), and
     the `init()` + DOMContentLoaded boot at the bottom. `[parallel]`
4. `docs/_sass/_tokens.scss` — The light-mode block currently lives at
   the **bottom of the file** (research §SCSS dependency graph) at lines
   116–143 and is keyed off `[data-theme="light"] { ... }`. Rewrite the
   selector so it becomes:

   ```scss
   @media (prefers-color-scheme: light) {
     :root {
       // ... existing token overrides unchanged ...
     }
   }
   ```

   Keep every CSS custom property assignment inside identical; only the
   wrapping selector changes. `[parallel]`
5. `docs/_sass/_syntax.scss` — Lines 78–95 currently read
   `[data-theme="light"] .highlight { ... }`. Rewrite to:

   ```scss
   @media (prefers-color-scheme: light) {
     .highlight {
       // ... existing rules unchanged ...
     }
   }
   ```

   Keep every nested selector and hex colour identical; only the
   wrapping changes. `[parallel]`
6. `docs/_sass/_layout.scss` — Delete:
   - The `[data-theme="light"] &` nested block inside `.site-header`
     (lines 41–43).
   - The entire `.theme-toggle { ... }` block (lines 220–253),
     including the nested `[data-theme="light"] &` rule inside it.
   `[parallel]`
7. `docs/_layouts/default.html` — Edit line 2 from
   `<html lang="en" data-theme="dark">` to `<html lang="en">`. The
   `prefers-color-scheme` media queries handle palette selection
   without an explicit attribute now. `[parallel]`

**Verification:**
- `! grep -RnE "localStorage|team-theme|data-theme|theme-toggle|\\.icon-moon|\\.icon-sun" docs/`
- `grep -n 'prefers-color-scheme: light' docs/_sass/_tokens.scss` — one
  match.
- `grep -n 'prefers-color-scheme: light' docs/_sass/_syntax.scss` — one
  match.
- `cd docs && bundle exec jekyll build --trace`
- Manual: load `/` on a system in dark mode → dark palette. Flip the OS
  to light mode → palette and code-block syntax colours flip. Header has
  no toggle button (just logo, nav, GitHub link, mobile hamburger).
  DevTools console clean.

**Commit:** `refactor(theme): collapse manual theme toggle to prefers-color-scheme`

---

## Done Criteria

- All six slices' acceptance tests pass.
- `cd docs && bundle exec jekyll build --trace` is clean at the end of
  every slice and at the tip of the branch.
- The cumulative final-verification grep from structure.md returns zero
  matches:
  `grep -RnE "reveal|Space Grotesk|team-theme|data-theme|theme-toggle|code-block-|\.callout|\.card[^-]|container--wide|fonts\.googleapis" docs/`
  (no matches expected).
- Manual smoke on `/` and `/architecture` per structure.md §"Final
  verification" items 2–7 (renders correctly, no console errors, no
  Google Fonts network requests, OS theme toggle works, mobile nav works).
- No unrelated edits in the worktree — only the files named in this plan
  are touched.

## Test architect inputs

There is no test harness under `docs/`. The acceptance criteria are
build-and-grep assertions, not unit tests. The test-architect should
either:

1. **Write `docs/plans/2026-05-19-simplify-jekyll-theme/checks.sh`** — a
   shell script that, run from the repo root, exits non-zero on failure.
   Suggested checks (each runnable independently so failures point at a
   specific slice):
   - Slice 1: `test ! -f docs/_sass/_utilities.scss`; `! grep -q
     'utilities' docs/assets/css/style.scss`; `! grep -RqE '\.card[^-a-zA-Z_]|\.card--interactive|\.callout|\.container--wide' docs/_sass docs/_includes docs/_layouts`.
   - Slice 2: `! grep -RqE 'fonts\.(googleapis|gstatic)\.com' docs/`;
     `! grep -qE "'Geist'|'Inter'|'JetBrains Mono'|'Fira Code'" docs/_sass/_tokens.scss`.
   - Slice 3: `! grep -RqE '\breveal\b|reveal--delay-' docs/_layouts docs/_includes docs/_sass docs/assets/js`.
   - Slice 4: `test ! -f docs/_includes/pipeline.html`;
     `! grep -Rq 'Space Grotesk' docs/`;
     `grep -q 'pipeline-phases' docs/_layouts/home.html`;
     `grep -q 'Question' docs/_layouts/home.html && grep -q 'PR' docs/_layouts/home.html` (sanity check for the 8 phase names).
   - Slice 5: `! grep -RqE 'code-block-(wrapper|header)|\.copy-btn|wrapCodeBlocks' docs/`.
   - Slice 6: `! grep -RqE 'localStorage|team-theme|data-theme|theme-toggle' docs/`;
     `grep -q 'prefers-color-scheme: light' docs/_sass/_tokens.scss`;
     `grep -q 'prefers-color-scheme: light' docs/_sass/_syntax.scss`.
   - Final mechanical gate: `cd docs && bundle exec jekyll build --trace`.

2. **Skip writing tests** if the structure.md acceptance criteria can be
   verified inline by the implementer at each slice's verification step
   without a dedicated script. This is also acceptable — the project has
   never had per-feature tests under `docs/`. If skipped, the
   test-architect should document the decision in a brief note alongside
   the artifacts.

Recommendation: write `checks.sh`. The grep assertions are mechanical and
re-runnable; bundling them into one script makes the per-slice gate
trivial for the implementer to invoke.
