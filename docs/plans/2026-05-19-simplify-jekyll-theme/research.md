---
topic: simplify-jekyll-theme
date: 2026-05-19
phase: research
---

# Research: simplify-jekyll-theme

## Tech stack

- Jekyll, no theme key (`docs/_config.yml`) — fully custom. Plugins:
  `jekyll-relative-links`, `jekyll-optional-front-matter`,
  `jekyll-seo-tag`, `jekyll-sitemap`. None require specific wrapping
  classes.
- Kramdown (GFM) + Rouge highlighter with `css_class: "highlight"`.
- Two published pages only: `docs/index.md` (`layout: home`) and
  `docs/architecture.md` (`layout: page`).
- Fonts loaded via Google Fonts: Space Grotesk + JetBrains Mono
  (`docs/_includes/head.html:12-14`). No icon libraries, no CDN JS,
  no analytics.
- Single vanilla-JS IIFE: `docs/assets/js/main.js`, 306 lines.

## File inventory

### Layouts (3)
- `docs/_layouts/default.html` — base wrapper; includes head, header,
  footer; loads `main.js` with `defer`.
- `docs/_layouts/home.html` — extends default; pulls `pipeline.html`
  + `feature-card.html` ×6; hero, stats row, pipeline section,
  features grid, CTA.
- `docs/_layouts/page.html` — extends default; two-column prose +
  sticky TOC; contains an inline `<script>` (lines 32–64) that
  builds the TOC from headings.

### Includes (5)
- `docs/_includes/head.html` — meta + SEO + Google Fonts +
  pre-paint theme init script.
- `docs/_includes/header.html` — sticky header (88 lines): logo,
  desktop nav, theme toggle button, GitHub link, mobile hamburger.
- `docs/_includes/footer.html` — multi-column footer (58 lines).
- `docs/_includes/pipeline.html` — 360-line self-contained
  CSS-animated SVG with SMIL particles. Has its own inline `<style>`
  block (lines 222–360). Zero JS dependency.
- `docs/_includes/feature-card.html` — parametric (icon, title,
  desc, tag, tag_type, delay).

### SCSS partials (7)
Imported flat from `docs/assets/css/style.scss` in this order:
`tokens → base → layout → components → prose → syntax → utilities`.
No partial imports another — all consume tokens at runtime via CSS
custom properties.

| Partial | Lines | Token refs | Notes |
|---|---|---|---|
| `_tokens.scss` | 143 | n/a | All design tokens; dark default + `[data-theme="light"]` override |
| `_base.scss` | 211 | ~30 | Resets, body, headings, links |
| `_layout.scss` | 357 | ~60 | Container, site-header, footer |
| `_components.scss` | 741 | ~80 | btn, badge, card, feature-card, hero, stats, pipeline-section, features-section, cta-section, reveal, code-block-wrapper |
| `_prose.scss` | 409 | ~60 | Long-form content; prose max-width 72ch; anchor heading links |
| `_syntax.scss` | 95 | 1 (`--space-5`) | Full Rouge replacement; hardcoded hex colors; dark + light variants |
| `_utilities.scss` | 109 | ~25 | Tailwind-style utilities |

### JavaScript (1)
- `docs/assets/js/main.js` — 306 lines, IIFE, 7 features. See § JS features below.

### Content (2)
- `docs/index.md` — home page (`layout: home`).
- `docs/architecture.md` — architecture doc (`layout: page`).

### Config / assets
- `docs/_config.yml` — Jekyll config; Kramdown + Rouge with
  `css_class: "highlight"`.
- `docs/assets/css/style.scss` — entry point; flat `@import` list.
- `docs/assets/favicon.svg`, `docs/assets/svg/logo.svg`.

## SCSS dependency graph

The graph is **strictly flat**:

```
_tokens.scss → (CSS custom properties at runtime)
                ├─ _base.scss
                ├─ _layout.scss
                ├─ _components.scss
                ├─ _prose.scss
                ├─ _syntax.scss   (1 reference; hardcoded hex otherwise)
                └─ _utilities.scss
```

No Sass `@import` between partials. Each partial reads tokens via
`var(--*)` at runtime. This means partials can be deleted or replaced
without touching the others (other than removing the line from
`style.scss`).

## What the layouts/templates actually use

### Class names referenced in templates
- **`_layout.scss`** classes used in templates: `.container`,
  `.container--narrow`, `.site-header` and `__inner`/`__logo`/
  `__nav`/`__nav-link`/`__actions`/`__github`/`__mobile-toggle`,
  `.logo-title`, `.logo-sub`, `.theme-toggle`, `.icon-moon`, `.icon-sun`,
  `.mobile-nav`, `.site-footer*`, `.site-main`.
- **`_components.scss`** classes used in templates: `.btn` (+
  `--primary`/`--secondary`/`--ghost`/`--lg`), `.badge` (+ `--accent`/
  `--gate`/`--muted`), `.feature-card*`, `.hero*`, `.pipeline-section*`,
  `.features-section*`, `.cta-section*`, `.stats-row`/`.stat*`,
  `.reveal`/`.reveal--delay-{1..5}`.

### Dead classes (defined but referenced nowhere)
- `_layout.scss`: `.container--wide`
- `_components.scss`: `.card`, `.card--interactive`, `.callout`,
  `.callout__icon`, `.callout__body`, `.callout--info`, `.callout--note`
- `_utilities.scss`: **all 109 lines** — no template currently uses
  any utility class. They sit there for hypothetical Markdown use.

### Runtime-injected classes (by `main.js`)
- `.code-block-wrapper`, `.code-block-header`, `.code-block-header__dots`,
  `.code-block-header__lang`, `.code-block-header__actions`, `.copy-btn`
  — wrapping every `<pre>`/`div.highlight`.
- `.anchor` — appended to `h2[id]`/`h3[id]`/`h4[id]` in `.prose`.
- `.reveal → .revealed` — toggled by IntersectionObserver.

## What `pipeline.html` is

A 360-line self-contained CSS-animated SVG (no JavaScript). Renders:
- `<svg viewBox="0 0 920 160">` with phase nodes, connector lines, gate
  pulses.
- `@keyframes dash-flow` on connector lines (lines 261–265).
- `@keyframes gate-pulse` on gate nodes (lines 276–283).
- `@keyframes end-pulse` on the end node (lines 285–292).
- 7 SMIL `<animateMotion>` particles traversing `<mpath>` paths
  (lines 55–62).
- Mobile fallback `<ol class="pipeline-phases">` shown <520px via
  CSS media query.
- Has its own inline `<style>` block (lines 222–360) — the only
  include that does this.
- Hardcodes `font-family="Space Grotesk, sans-serif"` on ~10 SVG
  `<text>` elements (lines 80, 82, 94, …) — depends on the Google
  Fonts load in `head.html`.

## What `main.js` does (7 features)

| Order | Feature | Lines | DOM coupling | Notes |
|---|---|---|---|---|
| 1 | Theme toggle | ~20 | `#theme-toggle`, `html[data-theme]`, `localStorage 'team-theme'` | Inline pre-paint script in `head.html:25` reads same key |
| 2 | Mobile nav | ~30 | `.site-header__mobile-toggle`, `.mobile-nav`, Escape key, click-outside | |
| 3 | Scroll reveal | ~25 | `.reveal` → `.revealed` via IntersectionObserver; falls back to revealing all if IO missing or reduced-motion | |
| 4 | Code-block wrapping + copy | ~70 | Wraps every `div.highlight` with macOS-style header (3 dots + lang label + copy button); two-tier clipboard fallback | The only feature that injects significant DOM |
| 5 | Heading anchors | ~13 | `.prose h2/h3/h4[id]` → appends `<a class="anchor">` | **Smallest, most isolated feature** |
| 6 | TOC tracking | ~30 | `.toc a[href^="#"]` + IntersectionObserver on headings | Works in tandem with the inline `<script>` in `page.html` that builds the TOC |
| 7 | (init wiring) | rest | DOMContentLoaded boot | |

All features are guarded by `if (el)` checks. The graceful-degradation
posture is solid — if any feature is removed, the rest still work.

## Rouge / syntax styling

- `_config.yml:24` sets `css_class: "highlight"`. Rouge emits
  `<div class="highlight"><pre>...</pre></div>` with token spans
  (`.k`, `.s`, `.c`, `.n*`, `.m*`, …).
- `_syntax.scss` is a **complete replacement** of Rouge's default
  stylesheet (no `@import` of Rouge default). Dark mode in
  `.highlight` (lines 6–76); light mode in
  `[data-theme="light"] .highlight` (lines 79–95). Hardcoded hex
  colors throughout. Per-language overrides for bash/sh/yaml/yml.
- Both `_syntax.scss` and `main.js` depend on the exact
  `div.highlight > pre` structure — if `css_class` is changed, both
  break.

## Third-party assets

Only Google Fonts. Two `<link rel="preconnect">` + one stylesheet
load for Space Grotesk and JetBrains Mono.

**Font discrepancy:** `_tokens.scss:36` declares
`--font-sans: 'Geist', 'Inter', system-ui, …` — but neither Geist
nor Inter is loaded anywhere. Body text falls through to system-ui
by default. Space Grotesk is loaded but only consumed by hardcoded
`font-family` attributes inside `pipeline.html` SVG text nodes.
This means today's body type is system-ui, not Space Grotesk.

## Hard constraints (must preserve or explicitly change)

1. Rouge wraps code in `<div class="highlight"><pre>...</pre></div>`.
   `_syntax.scss` and `main.js` both depend on it.
2. `_config.yml`'s `css_class: "highlight"` — changing it breaks both
   `_syntax.scss` and `main.js`.
3. `localStorage` key `'team-theme'` is referenced in both
   `head.html:25` (inline pre-paint) and `main.js` — must stay in sync.
4. `page.html`'s inline TOC builder writes the markup that
   `main.js`'s TOC active-tracker reads.
5. `pipeline.html`'s SVG text uses `Space Grotesk`. If the Google
   Fonts load goes, the SVG text falls back to generic sans-serif.

## Soft constraints (safe to drop)

- `_utilities.scss`: 0 references from any template. Safe to delete
  in full.
- `.card`, `.card--interactive`, `.callout*`, `.container--wide`:
  defined but never used.
- The font discrepancy — declaring `Geist`/`Inter` without loading
  them — is a latent bug, not a hard constraint.

## Test patterns

No tests exist under `docs/`. The repo-wide TEAM test harness does
not cover the Jekyll site. Build correctness is verified by
`bundle exec jekyll build --trace`.

## Reference points by question

- **Q11 — smallest self-contained JS feature**: `addAnchorLinks()`
  (`main.js:279–291`). 13 lines, one DOM query, no shared state, no
  feature gates.
- **Q12 — narrowest SCSS partial**: `_syntax.scss` (95 lines, 1 token
  reference, single top-level selector `.highlight`).
- **Q13 — third-party assets**: Google Fonts only (Space Grotesk +
  JetBrains Mono).

## Open questions for design

1. Drop the `--font-sans: 'Geist', 'Inter', ...` lie. Either load a
   font and use it, or fall through to system-ui honestly.
2. The 360-line animated pipeline is the largest single include. It
   is the home page's identity. Replacing it with a static SVG, an
   ASCII diagram, or a CSS-only stripe layout meaningfully reduces
   complexity but changes the home page's character.
3. The two-mode theme system (dark default + light via toggle +
   localStorage) is ~60 lines across `_tokens.scss`, `head.html`,
   `header.html`, and `main.js`. Collapsing to `prefers-color-scheme`
   alone removes the toggle button, the localStorage key, the inline
   pre-paint script, and the toggle wiring in `main.js` — at the
   cost of user override.
4. The macOS-style code block headers (3 dots + language label +
   copy button, injected by `main.js`) add ~70 lines of JS plus the
   `.code-block-*` styles in `_components.scss`. Plain code blocks
   with native browser copy work fine on a docs site.
5. Scroll-reveal motion adds ~25 lines of JS and the `.reveal*`
   styles. Disabled under `prefers-reduced-motion` already. Removing
   it leaves the site usable.
6. `_utilities.scss` is entirely unused and can be deleted.
