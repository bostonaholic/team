---
topic: simplify-jekyll-theme
date: 2026-05-19
phase: questions
---

# Research Questions: simplify-jekyll-theme

## Codebase context
- Scope: `docs/_layouts/`, `docs/_includes/`, `docs/_sass/`, `docs/assets/js/main.js`,
  `docs/assets/css/style.scss`, `docs/_config.yml`
- Vocabulary:
  - **partials** — the seven `_sass/_*.scss` files loaded via `assets/css/style.scss`
  - **includes** — Liquid template fragments under `docs/_includes/`
  - **pipeline include** — `docs/_includes/pipeline.html`, the largest include at 360 lines
  - **main.js** — `docs/assets/js/main.js`, the single JavaScript file (306 lines)
  - **content pages** — `docs/index.md` (home) and `docs/architecture.md` (the only two published pages)

## Topology

1. Which layouts does each content page declare in its front matter, and what
   includes does each layout pull in?

2. What is the full dependency chain from `assets/css/style.scss` through each
   `_sass/` partial — which partials import others, and in what order?

3. Which HTML elements and CSS class names in the content pages are produced by
   Kramdown/Rouge (i.e., generated at build time) versus authored in layouts or
   includes?

4. What does `docs/_includes/pipeline.html` render — is it a static SVG, an
   animated SVG driven by CSS, or does it require JavaScript to function?

## Conventions

5. What CSS custom-property naming convention is used in `_sass/_tokens.scss`,
   and how widely are those variables referenced across the other partials?

6. What JavaScript feature-detection or progressive-enhancement patterns appear
   in `main.js` — which behaviours degrade gracefully when JS is absent?

7. What Rouge CSS classes does `_sass/_syntax.scss` target, and does it duplicate
   or extend the default Rouge stylesheet?

## Constraints

8. Which classes or element selectors in `_sass/_components.scss` and
   `_sass/_layout.scss` are referenced directly by the layout templates
   (`default.html`, `home.html`, `page.html`) or the includes, versus used
   only internally within the SCSS?

9. What does `_sass/_utilities.scss` contain — single-purpose utility classes,
   or layout/component helpers that layouts depend on?

10. Does `docs/_config.yml` declare any Jekyll plugins whose output requires
    specific wrapping elements or CSS classes to render correctly?

## Reference points

11. What is the smallest self-contained feature in `main.js` — the one with the
    fewest DOM dependencies and the least coupling to other sections of the file?

12. Which SCSS partial has the fewest cross-references to other partials and the
    narrowest surface area (fewest selectors or class names used elsewhere)?

13. Are there any third-party CSS or JS assets loaded via `_includes/head.html`
    (e.g., Google Fonts, icon libraries, CDN scripts), and what exactly do they
    provide?
