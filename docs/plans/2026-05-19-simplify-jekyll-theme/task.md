---
topic: simplify-jekyll-theme
date: 2026-05-19
phase: task
ticketId: null
---

# Task: simplify-jekyll-theme

## Description
The custom Jekyll theme introduced in PR #8 (branch `feat/custom-jekyll-theme`) is
more complex than necessary for a two-page docs site (home + architecture). The user
wants it simplified.

Current theme inventory (all under `docs/`):
- `_includes/pipeline.html` — 360-line animated SVG QRSPI pipeline
- `assets/js/main.js` — 306 lines: theme toggle, mobile nav, scroll-reveal,
  copy-code buttons with macOS-style headers, TOC tracking, heading anchors
- `_sass/` — 7 partials totalling ~2700 lines (_base, _components, _layout,
  _prose, _syntax, _tokens, _utilities)
- `_layouts/` — default, home, page
- `_includes/` — head, header, footer, pipeline, feature-card

## Stated goal
Reduce the complexity of the custom Jekyll theme to a level appropriate for a
small two-page docs site, while keeping it functional and visually coherent.

## Inferred goal
Strip out interactive flourishes and heavy SCSS that exist to impress rather than
to communicate — leaving a clean, maintainable theme the project can actually own
long-term without fighting it.

## Acceptance signals
- The total JS payload is materially smaller (or gone)
- The SCSS is meaningfully shorter and easier to follow without a design-system
  background
- The site still renders the home page and the architecture page correctly
- Any remaining interactive behaviour is proportionate to actual user need on a
  docs site (e.g., readable code blocks, navigable on mobile)

## Open assumptions
- Dark-mode support is worth keeping if it can be done simply (CSS custom
  properties + `prefers-color-scheme` without `localStorage` toggle machinery)
- The animated SVG pipeline in `_includes/pipeline.html` is a candidate for
  simplification or replacement with a static diagram
- The macOS-style code-block headers (traffic-light dots + language label) may be
  dropped in favour of plain styled code blocks
- Scroll-reveal motion can be removed entirely
- The sticky TOC sidebar on the architecture page is genuinely useful and may stay
  if it remains simple
- Mobile navigation should stay functional
