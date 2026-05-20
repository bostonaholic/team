---
topic: simplify-jekyll-theme
date: 2026-05-19
phase: design
approved: true
approved_at: 2026-05-19T00:00:00Z
revision: 1
---

# Design: simplify-jekyll-theme

> Note: `AskUserQuestion` is unavailable inside subagents, so the four
> forks below are presented as recommended defaults with trade-offs
> named in line. The orchestrator's human gate is the place to redirect
> any of them.

## Current state

The Jekyll site under `docs/` serves exactly two pages — `index.md`
(`layout: home`) and `architecture.md` (`layout: page`) — but ships with
the surface area of a small design system. SCSS totals ~2,065 lines
across 7 flat partials (`docs/assets/css/style.scss` imports them in
order: tokens → base → layout → components → prose → syntax →
utilities). JavaScript is a single 306-line IIFE (`docs/assets/js/main.js`)
exposing 7 features: theme toggle, mobile nav, scroll-reveal,
code-block wrapping with macOS-style headers + copy buttons, heading
anchors, TOC tracking, and init wiring.

The biggest single artifact is `docs/_includes/pipeline.html`: 360
lines of self-contained CSS-animated SVG with SMIL particles, its
own inline `<style>` block (lines 222–360), and hardcoded `font-family
="Space Grotesk"` baked into ~10 `<text>` nodes. The theme toggle
is cross-file coupled: `head.html:25` runs a pre-paint script reading
`localStorage 'team-theme'`, `header.html` renders the button,
`main.js` wires it, and `_tokens.scss` defines the `[data-theme="light"]`
override.

Dead code is real and measurable. `_utilities.scss` (109 lines) has
zero template references. `_components.scss` defines `.card`,
`.card--interactive`, `.callout`, `.callout__icon`, `.callout__body`,
`.callout--info`, `.callout--note` — none referenced. `_layout.scss`
defines `.container--wide` — unreferenced. `_tokens.scss:36` declares
`--font-sans: 'Geist', 'Inter', system-ui, ...` but neither Geist
nor Inter is loaded; body text silently falls through to system-ui
while Google Fonts loads Space Grotesk and JetBrains Mono — the
former consumed only by the pipeline SVG, the latter by code blocks.

## Desired end state

A theme that matches the site it serves: two pages, one designer,
no design-system overhead. SCSS drops to ~3 partials totaling well
under 1,000 lines. JavaScript shrinks to a single sub-50-line file
(heading anchors + TOC active-tracking only) or disappears entirely.
The home page renders the QRSPI pipeline as a styled ordered list
inside the existing `.pipeline-section` shell, with the same phase
names and gate badges but no SVG, no SMIL, no inline `<style>`.

Theming collapses to `prefers-color-scheme` alone: the `<html>`
attribute toggle, the `localStorage 'team-theme'` key, the pre-paint
script in `head.html`, the toggle button in `header.html`, and the
~20 lines of toggle JS in `main.js` all go. `_tokens.scss` keeps
both palettes but switches them via
`@media (prefers-color-scheme: light)` instead of
`[data-theme="light"]`. Code blocks render as plain styled `<pre>`
elements: `_syntax.scss` stays (it's already the narrowest partial
at 95 lines), but the macOS-style header wrapper and copy button
injected by `main.js` go away, along with the `.code-block-*` rules
in `_components.scss`. Users select-and-copy.

Fonts get honest. We either (a) keep loading Space Grotesk + JBM
and reference them by name in `_tokens.scss`, or (b) drop the Google
Fonts link entirely and use the system stack — the recommended
default below picks (b) because it removes a third-party dependency
and matches the "small docs site" target.

## Patterns to follow

- **Flat SCSS imports stay flat.** `docs/assets/css/style.scss` keeps
  the no-`@import`-between-partials model. Each partial reads tokens
  via CSS custom properties at runtime. (Research §SCSS dependency graph.)
- **IIFE + `if (el)` guards.** Whatever JS survives keeps the
  `(function () { ... })()` wrapper and per-feature null-check
  pattern from `main.js:1-306`. Graceful degradation is already the
  house style.
- **Pre-existing narrow partial.** `_syntax.scss` is the model for
  "small, scoped, self-contained" — 95 lines, one top-level selector.
  We're not refactoring it; we're keeping it.
- **Existing section shells.** Home page sections (`.hero`,
  `.pipeline-section`, `.features-section`, `.cta-section`) keep
  their layout classes; only the pipeline's interior swaps from SVG
  to `<ol>`.

## Decisions made

1. **Pipeline include → styled ordered list.** Replace
   `_includes/pipeline.html` (360 lines) with a ~25-line styled
   `<ol class="pipeline-phases">` listing the 8 QRSPI phases with
   their gate markers. Alternatives: keep animated SVG (largest
   single source of complexity stays); reduce to static SVG (still
   ~100 lines + inline `<style>`). The list option removes the
   single largest file in the theme and is consistent with a docs
   site's "communicate, don't perform" target. Recommended default.

2. **Theme system → `prefers-color-scheme` only.** Drop the toggle
   button (`header.html`), pre-paint script (`head.html:25`),
   `localStorage 'team-theme'` key, and the toggle feature in
   `main.js`. Switch `_tokens.scss` from `[data-theme="light"]` to
   `@media (prefers-color-scheme: light)`. Alternative: keep manual
   toggle (~60 lines of cross-file coupling stays). Trade-off
   accepted: users lose manual override. Recommended default.

3. **Code block headers → plain styled `<pre>`.** Remove the
   `wrapCodeBlocks` feature from `main.js` (~70 lines) and the
   `.code-block-*` rules in `_components.scss`. Keep `_syntax.scss`
   unchanged. Alternatives: keep current macOS-style headers (largest
   JS feature stays); copy-button-only (still needs JS + wrapper).
   Trade-off accepted: no copy button. Recommended default.

4. **Scroll-reveal motion → removed.** Delete the `revealOnScroll`
   feature in `main.js` (~25 lines), the `.reveal` /
   `.reveal--delay-*` rules in `_components.scss`, and every
   `class="reveal*"` attribute in `home.html`. The site reads the
   same without it. Recommended default.

5. **`_utilities.scss` → deleted.** Zero template references; safe
   to remove in full along with its line in `style.scss`.

6. **Dead component classes → deleted.** Remove `.card`,
   `.card--interactive`, `.callout*` from `_components.scss` and
   `.container--wide` from `_layout.scss`. Zero references.

7. **Fonts → system stack, drop Google Fonts.** Remove the two
   `preconnect` links and the Google Fonts stylesheet from
   `head.html`. Rewrite `_tokens.scss --font-sans` to a
   system-ui stack honestly, and `--font-mono` to
   `ui-monospace, SFMono-Regular, Menlo, monospace`. Since the
   pipeline SVG is being dropped (Decision 1), the only consumer
   of Space Grotesk goes with it. Alternative: load Space Grotesk
   and actually use it for body type. Trade-off accepted: typography
   becomes OS-native instead of branded. Recommended default.

8. **Mobile nav → kept.** Two-page sites still get viewed on phones.
   The mobile-nav feature in `main.js` (~30 lines) and the
   `.mobile-nav` styles stay. Smallest user-facing function we'd
   miss if removed.

9. **Heading anchors + TOC tracking → kept.** Both serve the
   architecture page directly. `addAnchorLinks()` (13 lines) and the
   TOC active-tracker (~30 lines) survive into a slimmer `main.js`.
   The inline TOC builder in `page.html:32-64` also stays.

## What stays vs. what goes (file-level)

**Kept**
- `_layouts/{default,home,page}.html`
- `_includes/{head,header,footer,feature-card}.html` (with toggle
  button + Google Fonts links removed from `head.html` / `header.html`)
- `_sass/_tokens.scss` (palette switch rewritten to media query;
  font declarations made honest)
- `_sass/_base.scss`, `_sass/_layout.scss`, `_sass/_prose.scss`,
  `_sass/_syntax.scss`
- `_sass/_components.scss` (trimmed: dead classes + code-block-*
  + reveal rules removed)
- A slimmer `assets/js/main.js`: mobile nav + heading anchors + TOC
  tracking + init only

**Removed**
- `_includes/pipeline.html` (replaced inline in `home.html` with a
  styled `<ol>`)
- `_sass/_utilities.scss`
- Theme toggle button markup in `header.html`
- Pre-paint script + Google Fonts links in `head.html`
- `wrapCodeBlocks`, `setupThemeToggle`, `revealOnScroll` features
  in `main.js`
- Dead classes in `_components.scss` / `_layout.scss`

## Rough impact

- SCSS: ~2,065 lines → est. ~1,200 lines (–40%)
- JS: 306 lines → est. ~80–100 lines (–70%)
- Includes: 5 → 4 (pipeline.html gone)
- Third-party network requests: Google Fonts (3 requests) → 0
- Cross-file coupling: theme key referenced in 4 files → 0

## Out of scope

- Rouge `css_class: "highlight"` stays. Both `_syntax.scss` and any
  surviving JS keep the `div.highlight > pre` assumption.
- Rewriting `_prose.scss` content/typography. It's verbose (409
  lines) but every selector serves the architecture page.
- Touching `_config.yml` plugins. None of them require theme work.
- Adding tests under `docs/`. No test harness exists; build is
  verified by `bundle exec jekyll build --trace`.
- Restyling the home page beyond replacing the pipeline interior.
  Hero, stats row, features grid, CTA section all keep their look.
- Changing Markdown source in `index.md` or `architecture.md`.

## Open questions (deferred)

- **Footer slimming.** `footer.html` is 58 lines, multi-column.
  Could collapse to a single line for a two-page site, but it's
  not load-bearing complexity — defer to structure phase.
- **`_prose.scss` audit.** 409 lines for one prose page is plausibly
  excessive, but every selector ties to actual markdown rendering on
  `architecture.md`. Defer unless structure phase finds dead rules.

## Risks

- **Home page identity shift.** The animated pipeline is the home
  page's signature. Replacing it with `<ol>` is the largest visible
  change in this plan; expect the home page to feel quieter.
- **Light-mode users on browsers without `prefers-color-scheme`.**
  Effectively none in 2026, but worth naming. Default (dark) still
  works.
- **Loss of copy-button affordance.** Code blocks become select-and-copy.
  On the architecture page this matters most for shell snippets.
- **Font fallback drift.** Body type today is already system-ui
  (font declaration is a lie). Removing Google Fonts only changes
  monospace blocks — JBM today, OS monospace after. Visible to
  anyone who knows the difference; invisible otherwise.
- **Pipeline SVG referrers.** No external links into `#pipeline-svg`
  or its node ids exist in repo content. External backlinks are
  unknown but unlikely for a project-internal docs site.
