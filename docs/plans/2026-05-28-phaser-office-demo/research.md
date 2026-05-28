---
topic: phaser-office-demo
date: 2026-05-28
phase: research
---

# Research: phaser-office-demo

Combines findings from the file-finder (file-location map) and researcher
(factual answers). All paths confirmed by grep/glob; none invented.

## Tech stack (factual)

- **Ruby toolchain:** Ruby 3.3.6 (`docs/.ruby-version`); Bundler 2.7.1;
  Jekyll 3.10.0 via `github-pages` gem 232; minima theme 2.5.1;
  `jekyll-remote-theme`; `webrick ~> 1.8`.
- **Node toolchain:** Root `package.json` declares `"type": "module"`
  and `"engines": { "bun": ">=1.0.0" }` with **no `scripts` field, no
  `dependencies`, no `devDependencies`**. No `package-lock.json`,
  no `bun.lockb`. Hooks are invoked with `#!/usr/bin/env node` (not
  bun) in `plugin.json`.
- **No frontend build tooling:** no Webpack, Vite, esbuild, TypeScript,
  PostCSS, Sass pipeline (beyond what minima provides), or bundler.
- **No CI:** no `.github/` directory anywhere; no GitHub Actions
  workflows; no lint/format enforcement.

## Q1. Top-level files under `docs/`

Non-vendor, non-generated contents directly under `docs/`:

| Path                  | Purpose                                                                 |
|-----------------------|-------------------------------------------------------------------------|
| `docs/index.md`       | Jekyll homepage; frontmatter `title: Overview`, `permalink: /`          |
| `docs/architecture.md`| Plugin architecture reference doc (Jekyll-rendered)                     |
| `docs/CNAME`          | Single line: `team.bostonaholic.dev`                                    |
| `docs/_config.yml`    | Jekyll config — minima theme, plugins, `exclude:` list                  |
| `docs/Gemfile`        | `github-pages`, `jekyll-remote-theme`, `webrick ~> 1.8`                 |
| `docs/Gemfile.lock`   | Locked gem versions; bundled with Bundler 2.7.1                         |
| `docs/.ruby-version`  | `3.3.6`                                                                 |
| `docs/screenshots/`   | 3 PNGs: `1-empty-state.png`, `2-single-session.png`, `3-multi-session.png` |
| `docs/plans/`         | Pipeline state artifacts (this directory) — Jekyll-excluded             |

## Q2. Deployment

- **No GitHub Actions workflows exist** (no `.github/` directory).
- Deployment inferred to be **GitHub Pages with `docs/` as the
  publishing source**, driven by the presence of `CNAME`, `_config.yml`
  pointing at `https://team.bostonaholic.dev`, and the `github-pages`
  gem in `Gemfile`.
- The `dev.yml` `docs` command (`bundle exec jekyll serve --livereload`)
  is for local preview only.
- **Implication for the Phaser demo:** GitHub Pages will continue to run
  Jekyll on `docs/` unless either (a) the site stops looking like a
  Jekyll site (drop `_config.yml` + `Gemfile`), or (b) a `.nojekyll`
  marker file is added at `docs/.nojekyll` to disable Jekyll
  processing while still serving static files from `docs/`.

## Q3. `CNAME` and hostname cross-references

`docs/CNAME` contains the single line `team.bostonaholic.dev`. The
hostname is referenced in:

- `docs/_config.yml` (`url: "https://team.bostonaholic.dev"`)
- `dev.yml` (`open.site`)
- `.claude-plugin/marketplace.json` (author URL)
- `README.md`
- `CHANGELOG.md`
- `.beads/issues.jsonl` (historical issue references)

## Q4. Package management

- Root `package.json`: ESM, bun engine, no scripts, no deps.
- **No other `package.json` files** outside `node_modules` and
  `vendor` (none exist under `docs/`).
- Bun is declared as engine but no bun lockfile is committed; in
  practice the plugin's runtime hooks shell out to `node`, not bun.

## Q5. Hook conventions (`.mjs` files in `hooks/`)

Four hooks: `pre-bash-guard.mjs`, `pre-compact-anchor.mjs`,
`post-write-validate.mjs`, `session-start-recover.mjs`.

- **Naming:** kebab-case, pattern `{event}-{purpose}.mjs`.
- **Module format:** ESM (`import` statements).
- **Built-ins:** `node:` imports (`node:fs/promises`, `node:path`,
  `node:url`).
- **Error handling:** fail-open — every `catch` block exits 0; stdin
  parsing wrapped in `try/catch`.
- **I/O contract:** read stdin as JSON (`for await` chunks), write
  JSON to stdout (`process.stdout.write(JSON.stringify({...}))`).
- **Structure:** single async `main()` invoked at end of file.

## Q6. JS lint / format / CI

None. No `.eslintrc*`, no `.prettierrc*`, no CI workflows. Style is
enforced manually by following existing `.mjs` conventions.

## Q7. Jekyll `exclude:` list

From `docs/_config.yml`:

```
exclude:
  - plans
  - Gemfile
  - Gemfile.lock
  - vendor
  - .bundle
  - .jekyll-cache
  - .sass-cache
  - .jekyll-metadata
```

A static HTML/JS file placed directly under `docs/` would not clash
with these. The `plans` exclusion is intentional — `docs/plans/`
(pipeline state) is co-located with the Jekyll source but excluded
from publication.

## Q8. `.gitignore` and `docs/`

Excluded paths:

- `docs/_site/`
- `docs/.jekyll-cache/`
- `docs/.sass-cache/`
- `docs/.jekyll-metadata`
- `docs/.bundle/`
- `docs/vendor/`

**Not excluded:** `docs/assets/`, `docs/src/`, `docs/node_modules/`,
or any other paths that would be created for a static site. (The
root `.gitignore` covers `node_modules/` globally.) `docs/screenshots/`
is currently tracked.

## Q9. Plugin distribution

- `plugin.json` declares 4 hooks pointing at `${CLAUDE_PLUGIN_ROOT}/hooks/*.mjs`.
  No `files`, `include`, or `exclude` field.
- `script/dev-install` is a bash script that symlinks the plugin into
  `~/.claude/plugins/cache/team-dev/team/<version>` and registers a
  local marketplace entry.
- The plugin is installed via `claude plugin add /path/to/team` (or the
  dev script).
- `docs/` is included in the plugin source directory but is **inert
  cargo** during plugin installation — no hook, manifest, or skill
  references it.

## Q10. Existing browser-runnable files

- **None** outside `vendor/` and `_site/` (both gitignored).
- All `.mjs` files in the repo are Node hooks, not browser code.
- No `.js`, `.html`, or `.css` files committed in the repo's working
  source — all HTML in the repo is generated by Jekyll into `docs/_site/`
  or shipped inside `docs/vendor/`.

## Q11. Visual / brand assets

- 3 PNG screenshots under `docs/screenshots/` (UI captures of the
  teamflow dashboard from prior work).
- The only SVGs in the repo are minima theme social icons inside
  `docs/_site/assets/` (gitignored build output) and inside
  `docs/vendor/` (gitignored gem bundle).
- **No custom logos, brand colors, or design tokens exist anywhere
  in the repo's committed source.**

**Implication for the demo:** all bitmap assets the spec requires
(sprite sheet, office background) must be **generated programmatically
or synthetically** during implementation. There are no source PNGs to
adapt and no brand palette to inherit. The implementer will need to
either:

- Embed asset generation in a one-shot Node script that writes the PNGs
  during a setup step (committed as the script + the generated PNGs); or
- Hand-craft minimal pixel-art PNGs and commit them directly.

## Q12. Ruby / Gemfile lock detail

- `docs/.ruby-version`: `3.3.6`.
- `docs/Gemfile.lock` locks: `github-pages 232`, `jekyll 3.10.0`,
  `minima 2.5.1`, `kramdown 2.4.0`, `rouge 3.30.0`, `webrick 1.9.2`.
- Platforms: `arm64-darwin`, `x86_64-darwin`.

## Q13. Test infrastructure

- 7 bash scripts under `tests/*.sh`, all `#!/usr/bin/env bash` with
  `set -euo pipefail`.
- Helper functions: `section()`, `assert()`, `pass()`, `fail()`.
- Assertions are mostly `grep -q` over agent/skill files for the
  presence of frontmatter fields, skill references, registry entries,
  etc.
- **No test infrastructure validates static-file output or web assets.**
- Test execution: `bash tests/<script>.sh` from repo root.

## Patterns and reusable components

- Two `.mjs` hooks (`pre-compact-anchor.mjs`, `session-start-recover.mjs`)
  duplicate a `findActiveTopic` function — no shared lib pattern is
  established.
- All YAML frontmatter on `agents/*.md` and `skills/*/SKILL.md` follows
  the Claude Code supported-fields list; the `post-write-validate.mjs`
  hook enforces this.
- `docs/plans/<id>/` is the durable pipeline-state directory; each
  artifact carries `topic`, `date`, `phase` YAML frontmatter (plus
  `approved`/`approved_at`/`revision` on gated artifacts).

## Hard constraints

- **Jekyll 3.10.0** is pinned via `github-pages 232` — not 4.x.
- **`docs/plans` is Jekyll-excluded** — pipeline artifacts are safe
  there.
- **No CI** means no automated lint/format gate; conventions are enforced
  socially or via the `post-write-validate` hook for plugin files only.
- **`docs/vendor/` and `docs/_site/` are gitignored** — cannot commit
  built assets there.
- **GitHub Pages will treat `docs/` as Jekyll-source unless
  `docs/.nojekyll` is added or `_config.yml`/`Gemfile` are removed.**

## Soft constraints

- No ESLint/Prettier — JS style follows existing `.mjs` conventions
  by example.
- `docs/screenshots/` is the only precedent for non-markdown assets
  committed under `docs/`.
- The root `package.json` is bun-oriented but lockfile-less; an
  added `docs/package.json` with its own (npm) toolchain is the
  cleanest way to avoid coupling.

## File-location index (from file-finder)

For convenience to the design-author:

- **Jekyll site source (current):** `docs/index.md`, `docs/architecture.md`,
  `docs/_config.yml`, `docs/Gemfile`, `docs/Gemfile.lock`, `docs/.ruby-version`,
  `docs/CNAME`, `docs/screenshots/*.png`.
- **Hook patterns to mirror (style only):** `hooks/*.mjs`.
- **Plugin manifest:** `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`.
- **Dev-install scripts:** `script/dev-install`, `script/dev-uninstall`.
- **Existing tests (pattern only):** `tests/*.sh`.
- **Pipeline artifacts:** `docs/plans/<id>/*.md`.

## Open items the design-author should resolve

1. **Jekyll vs static decision.** The Jekyll site currently at
   `team.bostonaholic.dev` carries `index.md` (landing) and
   `architecture.md` (plugin reference). Replacing it with a Phaser
   demo loses those pages. Options:
   - **Full replacement:** drop `_config.yml`, `Gemfile`, `Gemfile.lock`,
     `index.md`, `architecture.md`; add `.nojekyll`; ship the demo as
     the new root. Reference docs would move elsewhere (the repo root
     `AGENTS.md`/`README.md`, or be deleted entirely).
   - **Coexistence:** keep Jekyll for `/architecture` and friends; serve
     the demo at `/` by giving `index.html` precedence over `index.md`
     (Jekyll renders `index.md` to `index.html` — collision risk).
   - **Subpath:** demo at `/demo/`, Jekyll site stays at `/`. Conflicts
     with the brief's intent of making the demo the primary landing.
2. **Asset generation strategy.** No source pixel art exists. Either
   (a) commit a Node script that generates the PNGs and run it once,
   or (b) hand-craft the PNGs and commit binaries.
3. **CDN vs node_modules for Phaser.** A pure CDN script tag avoids
   `npm install` mattering; `node_modules` requires committing or
   `.gitignore`-ing it (the latter conflicts with "open `index.html`
   in a browser" without `npm install` first).
4. **`docs/package.json` placement.** Sitting beside `docs/Gemfile` is
   ergonomic but unusual; the design should explicitly endorse it.
