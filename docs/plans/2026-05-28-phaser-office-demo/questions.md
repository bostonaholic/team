---
topic: phaser-office-demo
date: 2026-05-28
phase: questions
---

# Research Questions: phaser-office-demo

## Codebase context

- Scope: `docs/` directory (current contents, structure, and deployment configuration);
  root-level `package.json` and `dev.yml`; `.gitignore` entries affecting `docs/`
- Vocabulary:
  - "static web assets" — HTML, JS, CSS, image files served directly without a build step
  - "docs site" — the contents of `docs/` as currently configured and deployed

## Topology

1. What files and subdirectories currently live directly under `docs/` (non-vendor, non-generated)?
   What is the purpose and content of each top-level file (`index.md`, `_config.yml`,
   `Gemfile`, `CNAME`, `architecture.md`)?

2. How is the `docs/` directory currently deployed? Is there a GitHub Actions workflow,
   a GitHub Pages configuration in the repo settings, or any CI/CD reference in the repo
   that specifies the publishing source?

3. What does the `docs/CNAME` file contain, and where else in the repo is that hostname
   referenced or documented?

## Conventions

4. What is the repo's Node/package-management story? The root `package.json` declares
   `"type": "module"` and `"engines": { "bun": ">=1.0.0" }` with no `scripts`. Are there
   any other `package.json` files in the repo (outside `node_modules` and `vendor`)? What
   package manager (`npm`, `bun`, `pnpm`, `yarn`) is used or expected for the root project?

5. What naming conventions, directory structure, and JavaScript style do the existing
   `.mjs` files in `hooks/` follow (e.g., module format, import style, error handling pattern)?

6. What lint, format, or CI rules currently apply to JavaScript files in this repo?
   Is there an ESLint config, Prettier config, or CI workflow that enforces JS style?

## Constraints

7. What paths under `docs/` are excluded from the Jekyll build (via `_config.yml`'s
   `exclude:` list or `.gitignore`)? Specifically, which subdirectories or file patterns
   would a static HTML/JS file placed directly under `docs/` need to avoid clashing with?

8. What does the root `.gitignore` say about `docs/` subdirectories? Are any paths
   relevant to static web assets (e.g., `docs/assets/`, `docs/src/`) currently excluded
   or tracked?

9. How is the plugin distributed and installed (as referenced in `plugin.json` and
   `dev.yml`)? Does the distribution/install mechanism include or exclude `docs/`?

## Reference points

10. Are there any existing static HTML files, JavaScript files, or browser-runnable
    examples anywhere in the repo (outside `vendor/` and `node_modules/`)?

11. What visual or brand assets — SVGs, PNGs, logos, color tokens — exist in the repo
    outside of `docs/vendor/` and `node_modules/`? Where are they located?

12. The `dev.yml` `docs` command runs Jekyll with `bundle exec jekyll serve`. What Ruby
    version is pinned (`.ruby-version`), and is there a `Gemfile.lock` that locks specific
    gem versions relevant to understanding the current docs toolchain?

13. What test infrastructure exists in `tests/`? What format are the test files (shell
    scripts, Node, etc.), and do any of them validate static-file output or web assets?
